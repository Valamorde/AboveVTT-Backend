import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ddb } from '../../shared/db';
import { makeApigw } from '../../shared/apigw';
import { keys } from '../../shared/keys';
import type { WsEvent, VTTMessage } from '../../shared/types';

interface Connection {
  objectId: string;
  connectionId: string;
  timestamp: number;
}

const MAX_CONNECTIONS = 30;

export async function forwardMessage(event: WsEvent, msg: VTTMessage): Promise<void> {
  const { campaignId } = msg;
  const senderId = event.requestContext.connectionId;

  const connectionData = await ddb.send(new QueryCommand({
    TableName: process.env.TABLE_NAME,
    KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
    ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.connPrefix() },
  })).catch((e: unknown) => {
    console.log('fuck. the query failed');
    console.log(e);
    return undefined;
  });

  if (!connectionData) return;

  const apigw = makeApigw(event);

  const fwdBody = JSON.parse(event.body!) as Record<string, unknown>;
  fwdBody.requestTimeEpoch = String(event.requestContext.requestTimeEpoch);
  const eventBodySend = JSON.stringify(fwdBody);

  const items = (connectionData.Items ?? []) as Connection[];
  items.sort((a, b) => b.timestamp - a.timestamp);

  const toDelete = items.length > MAX_CONNECTIONS ? items.splice(MAX_CONNECTIONS) : [];

  const deleteCalls = toDelete.map(({ objectId, connectionId }) =>
    Promise.allSettled([
      apigw.send(new DeleteConnectionCommand({ ConnectionId: connectionId })),
      ddb.send(new DeleteCommand({ TableName: process.env.TABLE_NAME, Key: { campaignId, objectId } })),
    ])
  );

  let counter = 0;
  const postCalls = items.map(({ objectId, connectionId, timestamp }) => {
    if (connectionId === senderId) return;

    if (timestamp < Date.now() - 1000 * 60 * 120) {
      console.log(`Found expired connection, deleting ${connectionId}`);
      return ddb.send(new DeleteCommand({ TableName: process.env.TABLE_NAME, Key: { campaignId, objectId } }));
    }

    counter++;
    return apigw.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: eventBodySend }))
      .catch((e: unknown) => {
        const err = e as { $metadata?: { httpStatusCode?: number }; name?: string };
        if (err.$metadata?.httpStatusCode === 410 || err.name === 'GoneException') {
          console.log(`Found stale connection, deleting ${connectionId}`);
          return ddb.send(new DeleteCommand({ TableName: process.env.TABLE_NAME, Key: { campaignId, objectId } }));
        }
        return;
      });
  });

  console.log(`message queued for ${counter} connections`);
  await Promise.allSettled(postCalls.concat(deleteCalls as never[]));
}
