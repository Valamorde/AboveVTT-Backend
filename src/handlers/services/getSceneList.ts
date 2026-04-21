import { sceneRepo } from '../../repositories/scene';
import type { ServiceContext } from '../../shared/types';

export async function getSceneList(ctx: ServiceContext): Promise<unknown> {
  return sceneRepo.listScenes(ctx.campaignId);
}
