import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getCampaignData } from './actions/getCampaignData';
import { setCampaignData } from './actions/setCampaignData';
import { migrate } from './actions/migrate';
import { exportScenes } from './actions/exportScenes';
import { getScene } from './actions/getScene';
import { getSceneList } from './actions/getSceneList';
import { getCurrentScene } from './actions/getCurrentScene';

export interface ServiceContext {
  campaignId: string;
  sceneId: string;
  body: Record<string, unknown>;
}

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
