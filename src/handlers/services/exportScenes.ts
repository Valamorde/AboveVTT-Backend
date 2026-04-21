import { sceneRepo } from '../../repositories/scene';
import { keys } from '../../shared/keys';
import type { ServiceContext } from '../../shared/types';

export async function exportScenes(ctx: ServiceContext): Promise<unknown> {
  const { campaignId } = ctx;

  const listResult = await sceneRepo.listScenes(campaignId);
  const export_data: unknown[] = [];
  const scenelist = (listResult.Items ?? []).map(el => el['data'] as Record<string, unknown>);

  const promises = scenelist.map(scene => {
    const sceneId = scene.id as string;
    scene.tokens = {};
    scene.reveals = [];
    scene.drawings = [];

    return sceneRepo.getBundle(campaignId, sceneId).then(sceneObjects => {
      const items = sceneObjects.Items ?? [];
      items
        .filter(el => (el['objectId'] as string).startsWith(keys.scenePrefix(sceneId) + '#tokens#'))
        .forEach(el => {
          const data = el['data'] as Record<string, unknown>;
          (scene.tokens as Record<string, unknown>)[data.id as string] = data;
        });

      const fogdata = items.find(el => el['objectId'] === keys.fogData(sceneId));
      if (fogdata?.['data']) scene.reveals = fogdata['data'] as unknown[];

      const drawdata = items.find(el => el['objectId'] === keys.drawData(sceneId));
      if (drawdata?.['data']) scene.drawings = drawdata['data'] as unknown[];

      export_data.push(scene);
    });
  });

  await Promise.allSettled(promises);
  return { statusCode: 200, body: JSON.stringify(export_data) };
}
