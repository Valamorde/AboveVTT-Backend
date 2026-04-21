import { sceneRepo } from '../../shared/repositories/scene';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const drawHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  return sceneRepo.putDrawData(campaignId, sceneId, msg.data);
};
