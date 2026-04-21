import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { sceneRepo } from '../../shared/repositories/scene';
import { makeApigw } from '../../shared/apigw';
import { DEFAULT_SCENE_ID } from '../../shared/constants';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

const DEFAULT_SCENE = {
  id: DEFAULT_SCENE_ID,
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

export const dmjoinHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const apigw = makeApigw(event);

  const listResult = await sceneRepo.listScenes(campaignId);
  const existingItems = listResult.Items ?? [];

  let scenelist: unknown[];
  let playerSceneId: unknown;
  let dmSceneId: unknown;

  const promises: Promise<unknown>[] = [];

  if (existingItems.length > 0) {
    console.log('DMjoin, found some scenes. I\'ll send them');
    scenelist = existingItems.map(el => el['data']);
    playerSceneId = await sceneRepo.getPlayerScene(campaignId);
    dmSceneId = await sceneRepo.getDmScene(campaignId) ?? DEFAULT_SCENE_ID;
  } else {
    console.log('generating empty scene');
    const basicScene = { ...DEFAULT_SCENE, order: Date.now() };
    scenelist = [basicScene];
    playerSceneId = DEFAULT_SCENE_ID;
    dmSceneId = DEFAULT_SCENE_ID;

    promises.push(sceneRepo.putSceneData(campaignId, basicScene.id, basicScene as Record<string, unknown>));
    promises.push(sceneRepo.putFogData(campaignId, basicScene.id, [[0, 0, 0, 0, 2, 0]]));
    promises.push(sceneRepo.setDmScene(campaignId, DEFAULT_SCENE_ID));
    promises.push(sceneRepo.setPlayerScene(campaignId, DEFAULT_SCENE_ID));
  }

  promises.push(
    Promise.resolve(playerSceneId).then(sceneid => {
      const sceneListMsg = { eventType: 'custom/myVTT/scenelist', data: scenelist, playersSceneId: sceneid };
      return apigw.send(new PostToConnectionCommand({
        ConnectionId: event.requestContext.connectionId,
        Data: JSON.stringify(sceneListMsg),
      }));
    })
  );

  await Promise.allSettled(promises);

  console.log(`The Current Scene id is ${String(dmSceneId)}`);
  const message = { eventType: 'custom/myVTT/fetchscene', data: { sceneid: dmSceneId } };
  return apigw.send(new PostToConnectionCommand({
    ConnectionId: event.requestContext.connectionId,
    Data: JSON.stringify(message),
  }));
};
