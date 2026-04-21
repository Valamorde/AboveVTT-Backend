import { sceneRepo } from '../../shared/repositories/scene';
import type { ServiceContext } from '../handler';

export async function getSceneList(ctx: ServiceContext): Promise<unknown> {
  return sceneRepo.listScenes(ctx.campaignId);
}
