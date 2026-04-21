import { sceneRepo } from '../../shared/repositories/scene';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const tokenHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  const data = msg.data ?? {};
  const tokenId = data['id'] as string;
  return sceneRepo.putTokenData(campaignId, sceneId, tokenId, data);
};

export const deleteTokenHandler: Handler = async (_event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId, sceneId = '' } = msg;
  const data = msg.data ?? {};
  const tokenId = data['id'] as string;
  return sceneRepo.deleteTokenData(campaignId, sceneId, tokenId);
};
