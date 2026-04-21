import { campaignRepo } from '../../repositories/campaign';
import type { ServiceContext } from '../../shared/types';

export async function setCampaignData(ctx: ServiceContext): Promise<unknown> {
  return campaignRepo.setData(ctx.campaignId, ctx.body);
}
