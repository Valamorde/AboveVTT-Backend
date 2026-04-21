import { QueryCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../shared/db';
import { keys } from '../../shared/keys';
import { switchSceneHandler } from './switch-scene';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const deleteSceneHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const sceneId = (msg.data?.['id'] ?? '') as string;

  console.log('deleting...');
  const sceneData = await ddb.send(new QueryCommand({
    TableName: process.env.TABLE_NAME,
    KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
    ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.scenePrefix(sceneId) },
    ProjectionExpression: 'objectId',
  }));

  const items = sceneData.Items ?? [];
  console.log(`I have to delete ${items.length} objects`);
  const promises: Promise<unknown>[] = [];
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25).map(item => ({
      DeleteRequest: { Key: { campaignId, objectId: item['objectId'] as string } },
    }));
    promises.push(ddb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_NAME!]: batch } })));
  }
  return Promise.allSettled(promises);
};

export const updateSceneHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const data = msg.data ?? {};
  const sceneId = data['id'] as string;
  const objectId = keys.sceneData(sceneId);
  const promises: Promise<unknown>[] = [];

  if (data['isnewscene']) {
    delete data['isnewscene'];
    promises.push(ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: { campaignId, objectId: keys.fogData(sceneId), data: [[0, 0, 0, 0, 2, 0]] },
    })));
  }

  promises.push(ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: { campaignId, objectId, data, sceneId },
  })));

  const switchDm = sceneId === msg.sceneId;
  if (switchDm) {
    console.log('forcing dm update after update_scene');
    promises.push(switchSceneHandler(event, {
      eventType: 'custom/myVTT/switch_scene',
      campaignId,
      cloud: 1,
      data: { sceneId, switch_dm: true },
    }));
  }

  const switchPlayers = sceneId === msg.playersSceneId;
  if (switchPlayers) {
    console.log('forcing players update after update_scene');
    promises.push(switchSceneHandler(event, {
      eventType: 'custom/myVTT/switch_scene',
      campaignId,
      cloud: 1,
      data: { sceneId },
    }));
  }

  return Promise.allSettled(promises).then(statuses => {
    console.log('statuses from update_scene');
    console.log(statuses);
  });
};
