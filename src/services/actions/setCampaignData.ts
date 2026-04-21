import { campaignRepo } from '../../shared/repositories/campaign';
import type { ServiceContext } from '../handler';

export async function setCampaignData(ctx: ServiceContext): Promise<unknown> {
  return campaignRepo.setData(ctx.campaignId, ctx.body);
}
