import { sceneRepo } from '../../repositories/scene';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const fogHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  return sceneRepo.putFogData(campaignId, sceneId, msg.data);
};
