import { sceneRepo } from '../../shared/repositories/scene';
import { campaignRepo } from '../../shared/repositories/campaign';
import { keys } from '../../shared/keys';
import { SCENE_ORDER_SPACING, BATCH_SIZE } from '../../shared/constants';
import type { ServiceContext } from '../handler';

export async function migrate(ctx: ServiceContext): Promise<unknown> {
  console.log('GOT A MIGRATION REQUEST!');
  const { campaignId } = ctx;
  const scenes = ctx.body as unknown as Array<Record<string, unknown>>;
  console.log(scenes);

  const requests: Array<Record<string, unknown>> = [];
  let nextorder = SCENE_ORDER_SPACING;
  let nextid = 100;

  scenes.forEach(scene => {
    const fogData = scene.reveals;
    const drawData = scene.drawings;
    const tokens = scene.tokens as Record<string, unknown>;
    scene.reveals = [];
    scene.drawings = [];
    scene.tokens = {};

    if (!scene.order) {
      scene.order = nextorder;
      nextorder += SCENE_ORDER_SPACING;
    }
    if (!scene.id) {
      scene.id = `migrated${nextid}`;
      nextid += 100;
    }

    const sceneId = scene.id as string;
    requests.push({ PutRequest: { Item: { campaignId, objectId: keys.sceneData(sceneId), sceneId, data: scene, timestamp: Date.now() } } });
    requests.push({ PutRequest: { Item: { campaignId, objectId: keys.fogData(sceneId), data: fogData, timestamp: Date.now() } } });
    requests.push({ PutRequest: { Item: { campaignId, objectId: keys.drawData(sceneId), data: drawData, timestamp: Date.now() } } });

    for (const tokenid in tokens) {
      requests.push({ PutRequest: { Item: { campaignId, objectId: keys.tokenData(sceneId, tokenid), data: tokens[tokenid], timestamp: Date.now() } } });
    }
  });

  requests.push({ PutRequest: { Item: { campaignId, objectId: keys.campaignData(), data: { cloud: 1 }, timestamp: Date.now() } } });

  console.log('preparing the batch writes');
  console.log(`Total requests: ${requests.length}, batch size: ${BATCH_SIZE}`);
  await sceneRepo.batchWriteAll(requests);
  return { statusCode: 200, body: 'Migrated' };
}
