import { campaignRepo } from '../../repositories/campaign';
import type { ServiceContext } from '../../shared/types';

export async function getCampaignData(ctx: ServiceContext): Promise<unknown> {
  return campaignRepo.getData(ctx.campaignId).catch(() => ({}));
}
