import { QueryCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ddb } from '../../shared/db';
import { makeApigw } from '../../shared/apigw';
import { keys } from '../../shared/keys';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

async function getCurrentSceneId(campaignId: string, getDmScene: boolean, forced: unknown = null): Promise<unknown> {
  if (forced !== null) return forced;
  const objectId = getDmScene ? keys.dmScene() : keys.playerScene();

  const data = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { campaignId, objectId },
  }));

  if (data.Item) {
    console.log('found the current scene');
    return data.Item['data'];
  }
  console.log("didn't found the current scene");
  return null;
}

export const dmjoinHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const apigw = makeApigw(event);

  const getReply = await ddb.send(new QueryCommand({
    TableName: process.env.TABLE_NAME,
    IndexName: 'sceneProperties',
    KeyConditionExpression: 'campaignId = :hkey',
    ExpressionAttributeValues: { ':hkey': campaignId },
  }));

  let scenelist: unknown[] = [];
  const promises: Promise<unknown>[] = [];
  let forceScene: unknown = null;

  if ((getReply.Items ?? []).length > 0) {
    console.log('DMjoin, found some scenes. I\'ll send them');
    scenelist = (getReply.Items ?? []).map(el => el['data']);
  } else {
    console.log('generating empty scene');
    forceScene = 666;
    const basicScene = {
      id: '666',
      title: 'The Tavern',
      dm_map: '',
      player_map: 'https://i.pinimg.com/originals/a2/04/d4/a204d4a2faceb7f4ae93e8bd9d146469.jpg',
      scale: '100',
      dm_map_usable: '0',
      fog_of_war: '1',
      tokens: {},
      grid: '0',
      hpps: '72',
      vpps: '72',
      snap: '1',
      fpsq: '5',
      offsetx: 29,
      offsety: 54,
      reveals: [[0, 0, 0, 0, 2, 0]],
      order: Date.now(),
    };
    scenelist = [basicScene];

    promises.push(ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: { campaignId, objectId: keys.sceneData(basicScene.id), sceneId: basicScene.id, data: basicScene, timestamp: Date.now() },
    })));
    promises.push(ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: { campaignId, objectId: keys.fogData(basicScene.id), data: [[0, 0, 0, 0, 2, 0]] },
    })));
    promises.push(ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: { campaignId, objectId: keys.dmScene(), data: '666' },
    })));
    promises.push(ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: { campaignId, objectId: keys.playerScene(), data: '666' },
    })));
  }

  promises.push(
    getCurrentSceneId(campaignId, false, forceScene).then(sceneid => {
      const sceneListMsg = { eventType: 'custom/myVTT/scenelist', data: scenelist, playersSceneId: sceneid };
      return apigw.send(new PostToConnectionCommand({
        ConnectionId: event.requestContext.connectionId,
        Data: JSON.stringify(sceneListMsg),
      }));
    })
  );

  await Promise.allSettled(promises);

  const sceneId = await getCurrentSceneId(campaignId, true, forceScene);
  console.log(`The Current Scene id is ${String(sceneId)}`);
  const message = { eventType: 'custom/myVTT/fetchscene', data: { sceneid: sceneId } };
  return apigw.send(new PostToConnectionCommand({
    ConnectionId: event.requestContext.connectionId,
    Data: JSON.stringify(message),
  }));
};
