import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ServiceContext } from '../shared/types';
import { getCampaignData } from '../handlers/services/getCampaignData';
import { setCampaignData } from '../handlers/services/setCampaignData';
import { migrate } from '../handlers/services/migrate';
import { exportScenes } from '../handlers/services/exportScenes';
import { getScene } from '../handlers/services/getScene';
import { getSceneList } from '../handlers/services/getSceneList';
import { getCurrentScene } from '../handlers/services/getCurrentScene';

type ServiceAction = (ctx: ServiceContext) => Promise<unknown>;

const actions: Record<string, ServiceAction> = {
  getCampaignData,
  setCampaignData,
  migrate,
  export_scenes: exportScenes,
  getScene,
  getSceneList,
  getCurrentScene,
};

export const handler = async (event: APIGatewayProxyEventV2): Promise<unknown> => {
  const action = event.queryStringParameters?.action ?? '';
  const ctx: ServiceContext = {
    campaignId: event.queryStringParameters?.campaign ?? '',
    sceneId: event.queryStringParameters?.scene ?? '',
    body: event.body ? JSON.parse(event.body) as Record<string, unknown> : {},
  };

  const fn = actions[action];
  if (!fn) return { statusCode: 200, body: 'unknown action' };
  return fn(ctx);
};
