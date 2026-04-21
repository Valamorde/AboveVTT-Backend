import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/db';
import { keys } from '../shared/keys';
import { TTL_SECONDS } from '../shared/constants';

export interface ConnectionItem {
  campaignId: string;
  objectId: string;
  connectionId: string;
  timestamp: number;
  ttl: number;
}

export const connectionRepo = {
  async put(campaignId: string, isDM: boolean, connectionId: string): Promise<void> {
    const objectId = keys.connection(isDM, connectionId);
    await ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        campaignId,
        objectId,
        connectionId,
        timestamp: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      },
    }));
  },

  async deleteById(campaignId: string, objectId: string): Promise<void> {
    await ddb.send(new DeleteCommand({
      TableName: process.env.TABLE_NAME,
      Key: { campaignId, objectId },
    }));
  },

  async queryByCampaign(campaignId: string): Promise<ConnectionItem[]> {
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
      ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.connPrefix() },
    }));
    return (result.Items ?? []) as ConnectionItem[];
  },

  async queryByType(campaignId: string, isDM: boolean): Promise<ConnectionItem[]> {
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
      ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.connByType(isDM) },
    }));
    return (result.Items ?? []) as ConnectionItem[];
  },

  async findByConnectionId(connectionId: string): Promise<ConnectionItem[]> {
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'connectionIds',
      KeyConditionExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: { ':connectionId': connectionId },
    }));
    return (result.Items ?? []) as ConnectionItem[];
  },
};
