import { connectionRepo } from '../shared/repositories/connection';
import type { WsEvent, LambdaResult } from '../shared/types';

export const handler = async (event: WsEvent): Promise<LambdaResult> => {
  const connectionId = event.requestContext.connectionId;
  console.log(`trying to delete ${connectionId}`);

  const toDelete = await connectionRepo.findByConnectionId(connectionId);

  const deleting = toDelete.map(async ({ campaignId, objectId }) => {
    console.log(`Deleting campaignId: ${campaignId} objectId: ${objectId}`);
    return connectionRepo.deleteById(campaignId, objectId);
  });

  try {
    await Promise.allSettled(deleting);
  } catch (e) {
    return { statusCode: 500, body: (e as Error).stack ?? String(e) };
  }

  return { statusCode: 200, body: 'Disconnected.' };
};
