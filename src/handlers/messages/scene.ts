import { sceneRepo } from '../../repositories/scene';
import { switchSceneHandler } from './switch-scene';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const deleteSceneHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const sceneId = (msg.data?.['id'] ?? '') as string;

  console.log('deleting...');
  return sceneRepo.deleteBundle(campaignId, sceneId);
};

export const updateSceneHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const data = msg.data ?? {};
  const sceneId = data['id'] as string;
  const promises: Promise<unknown>[] = [];

  if (data['isnewscene']) {
    delete data['isnewscene'];
    promises.push(sceneRepo.putFogData(campaignId, sceneId, [[0, 0, 0, 0, 2, 0]]));
  }

  promises.push(sceneRepo.putSceneData(campaignId, sceneId, data));

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
