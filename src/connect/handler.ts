import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/db';
import { keys } from '../shared/keys';
import type { WsEvent, LambdaResult } from '../shared/types';

export const handler = async (event: WsEvent): Promise<LambdaResult> => {
  const campaignId = event.queryStringParameters?.campaign ?? '';
  const isDM = !!event.queryStringParameters?.DM;
  const objectId = keys.connection(isDM, event.requestContext.connectionId);

  console.log(`Adding ${objectId} to ${campaignId}`);

  try {
    await ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        campaignId,
        objectId,
        connectionId: event.requestContext.connectionId,
        timestamp: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + 7200,
      },
    }));
  } catch (err) {
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'Connected.' };
};
