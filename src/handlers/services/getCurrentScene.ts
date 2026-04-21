import { sceneRepo } from '../../repositories/scene';
import type { ServiceContext } from '../../shared/types';

export async function getCurrentScene(ctx: ServiceContext): Promise<unknown> {
  const [dmScene, playerScene] = await Promise.all([
    sceneRepo.getDmScene(ctx.campaignId),
    sceneRepo.getPlayerScene(ctx.campaignId),
  ]);
  return {
    dmscene: dmScene ?? '',
    playerscene: playerScene ?? '',
  };
}
