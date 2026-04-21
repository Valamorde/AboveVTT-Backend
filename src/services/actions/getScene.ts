import { sceneRepo } from '../../shared/repositories/scene';
import { keys } from '../../shared/keys';
import type { ServiceContext } from '../handler';

export async function getScene(ctx: ServiceContext): Promise<unknown> {
  const { campaignId, sceneId } = ctx;

  const data = await sceneRepo.getBundle(campaignId, sceneId);

  console.log('got SceneData');
  const items = data.Items ?? [];
  const sceneData = items.find(el => el['objectId'] === keys.sceneData(sceneId)) as Record<string, unknown>;
  const sceneDatum = sceneData['data'] as Record<string, unknown>;

  sceneDatum.tokens = items
    .filter(el => (el['objectId'] as string).startsWith(keys.scenePrefix(sceneId) + '#tokens#'))
    .map(el => el['data']);

  const fogdata = items.find(el => el['objectId'] === keys.fogData(sceneId));
  sceneDatum.reveals = fogdata?.['data'] ?? [];

  const drawdata = items.find(el => el['objectId'] === keys.drawData(sceneId));
  sceneDatum.drawings = drawdata?.['data'] ?? [];

  console.log('returning SceneData');
  return sceneData;
}
