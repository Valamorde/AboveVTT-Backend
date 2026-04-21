import { campaignRepo } from '../../shared/repositories/campaign';
import type { ServiceContext } from '../handler';

export async function getCampaignData(ctx: ServiceContext): Promise<unknown> {
  return campaignRepo.getData(ctx.campaignId).catch(() => ({}));
}
