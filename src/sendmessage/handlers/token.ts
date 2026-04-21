import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../shared/db';
import { keys } from '../../shared/keys';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const tokenHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  const data = msg.data ?? {};
  const tokenId = data['id'] as string;
  return ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: { campaignId, objectId: keys.tokenData(sceneId, tokenId), data, timestamp: Date.now() },
  }));
};

export const deleteTokenHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  const data = msg.data ?? {};
  const tokenId = data['id'] as string;
  return ddb.send(new DeleteCommand({
    TableName: process.env.TABLE_NAME,
    Key: { campaignId, objectId: keys.tokenData(sceneId, tokenId) },
  }));
};
