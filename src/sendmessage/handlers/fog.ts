import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../shared/db';
import { keys } from '../../shared/keys';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const fogHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  return ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: { campaignId, objectId: keys.fogData(sceneId), data: msg.data, timestamp: Date.now() },
  }));
};
