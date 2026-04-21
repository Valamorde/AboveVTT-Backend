import { connectionRepo } from '../repositories/connection';
import type { WsEvent, LambdaResult } from '../shared/types';

export const handler = async (event: WsEvent): Promise<LambdaResult> => {
  const campaignId = event.queryStringParameters?.campaign ?? '';
  const isDM = !!event.queryStringParameters?.DM;
  const connectionId = event.requestContext.connectionId;

  console.log(`Adding connection ${connectionId} to ${campaignId} (isDM=${isDM})`);

  try {
    await connectionRepo.put(campaignId, isDM, connectionId);
  } catch (err) {
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'Connected.' };
};
