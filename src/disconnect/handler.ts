import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/db';
import type { WsEvent, LambdaResult } from '../shared/types';

export const handler = async (event: WsEvent): Promise<LambdaResult> => {
  const connectionId = event.requestContext.connectionId;
  console.log(`trying to delete ${connectionId}`);

  const toDelete = await ddb.send(new QueryCommand({
    TableName: process.env.TABLE_NAME,
    IndexName: 'connectionIds',
    KeyConditionExpression: 'connectionId = :connectionId',
    ExpressionAttributeValues: { ':connectionId': connectionId },
  }));

  const deleting = (toDelete.Items ?? []).map(async (item) => {
    const campaignId = item['campaignId'] as string;
    const objectId = item['objectId'] as string;
    console.log(`Deleting campaignId: ${campaignId} objectId: ${objectId}`);
    return ddb.send(new DeleteCommand({
      TableName: process.env.TABLE_NAME,
      Key: { campaignId, objectId },
    }));
  });

  try {
    await Promise.allSettled(deleting);
  } catch (e) {
    return { statusCode: 500, body: (e as Error).stack ?? String(e) };
  }

  return { statusCode: 200, body: 'Disconnected.' };
};
