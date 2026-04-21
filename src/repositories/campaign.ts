import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/db';
import { keys } from '../shared/keys';

const TABLE = (): string => process.env.TABLE_NAME!;

export const campaignRepo = {
  async getData(campaignId: string): Promise<unknown> {
    return ddb.send(new GetCommand({
      TableName: TABLE(),
      Key: { campaignId, objectId: keys.campaignData() },
    }));
  },

  async setData(campaignId: string, data: unknown): Promise<unknown> {
    return ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.campaignData(), data, timestamp: Date.now() },
    }));
  },
};
