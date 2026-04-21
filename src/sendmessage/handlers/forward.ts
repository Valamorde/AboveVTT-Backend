import { PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { connectionRepo } from '../../shared/repositories/connection';
import { makeApigw } from '../../shared/apigw';
import type { WsEvent, VTTMessage } from '../../shared/types';

const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS ?? '30', 10);

export async function forwardMessage(event: WsEvent, msg: VTTMessage): Promise<void> {
  const { campaignId } = msg;
  const senderId = event.requestContext.connectionId;

  const items = await connectionRepo.queryByCampaign(campaignId).catch((e: unknown) => {
    console.error('connection query failed', e);
    return undefined;
  });

  if (!items) return;

  const apigw = makeApigw(event);

  const fwdBody = JSON.parse(event.body!) as Record<string, unknown>;
  fwdBody.requestTimeEpoch = String(event.requestContext.requestTimeEpoch);
  const eventBodySend = JSON.stringify(fwdBody);

  items.sort((a, b) => b.timestamp - a.timestamp);

  const toDelete = items.length > MAX_CONNECTIONS ? items.splice(MAX_CONNECTIONS) : [];

  const deleteCalls = toDelete.map(({ objectId, connectionId }) =>
    Promise.allSettled([
      apigw.send(new DeleteConnectionCommand({ ConnectionId: connectionId })),
      connectionRepo.deleteById(campaignId, objectId),
    ])
  );

  let counter = 0;
  const postCalls = items.map(({ objectId, connectionId }) => {
    if (connectionId === senderId) return;

    counter++;
    return apigw.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: eventBodySend }))
      .catch((e: unknown) => {
        const err = e as { $metadata?: { httpStatusCode?: number }; name?: string };
        if (err.$metadata?.httpStatusCode === 410 || err.name === 'GoneException') {
          console.log(`Found stale connection, deleting ${connectionId}`);
          return connectionRepo.deleteById(campaignId, objectId);
        }
        return;
      });
  });

  console.log(`message queued for ${counter} connections`);
  await Promise.allSettled(postCalls.concat(deleteCalls as never[]));
}
