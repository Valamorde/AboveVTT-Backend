import { GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db';
import { keys } from '../keys';
import { BATCH_SIZE } from '../constants';

const TABLE = (): string => process.env.TABLE_NAME!;

export const sceneRepo = {
  async getDmScene(campaignId: string): Promise<string | null> {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE(),
      Key: { campaignId, objectId: keys.dmScene() },
    }));
    return result.Item ? (result.Item['data'] as string) : null;
  },

  async setDmScene(campaignId: string, sceneId: string): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.dmScene(), data: sceneId },
    }));
  },

  async getPlayerScene(campaignId: string): Promise<string | null> {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE(),
      Key: { campaignId, objectId: keys.playerScene() },
    }));
    return result.Item ? (result.Item['data'] as string) : null;
  },

  async setPlayerScene(campaignId: string, sceneId: string): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.playerScene(), data: sceneId },
    }));
  },

  async listScenes(campaignId: string): Promise<QueryCommandOutput> {
    return ddb.send(new QueryCommand({
      TableName: TABLE(),
      IndexName: 'sceneProperties',
      KeyConditionExpression: 'campaignId = :hkey',
      ExpressionAttributeValues: { ':hkey': campaignId },
    }));
  },

  async getBundle(campaignId: string, sceneId: string): Promise<QueryCommandOutput> {
    return ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
      ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.scenePrefix(sceneId) },
    }));
  },

  async putSceneData(
    campaignId: string,
    sceneId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.sceneData(sceneId), sceneId, data, timestamp: Date.now() },
    }));
  },

  async putFogData(
    campaignId: string,
    sceneId: string,
    data: unknown,
  ): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.fogData(sceneId), data, timestamp: Date.now() },
    }));
  },

  async putDrawData(
    campaignId: string,
    sceneId: string,
    data: unknown,
  ): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.drawData(sceneId), data, timestamp: Date.now() },
    }));
  },

  async putTokenData(
    campaignId: string,
    sceneId: string,
    tokenId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { campaignId, objectId: keys.tokenData(sceneId, tokenId), data, timestamp: Date.now() },
    }));
  },

  async deleteTokenData(campaignId: string, sceneId: string, tokenId: string): Promise<void> {
    await ddb.send(new DeleteCommand({
      TableName: TABLE(),
      Key: { campaignId, objectId: keys.tokenData(sceneId, tokenId) },
    }));
  },

  async deleteBundle(campaignId: string, sceneId: string): Promise<void> {
    const sceneData = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
      ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.scenePrefix(sceneId) },
      ProjectionExpression: 'objectId',
    }));
    const items = sceneData.Items ?? [];
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE).map(item => ({
        DeleteRequest: { Key: { campaignId, objectId: item['objectId'] as string } },
      }));
      promises.push(ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE()]: batch } })));
    }
    await Promise.allSettled(promises);
  },

  async batchWriteAll(requests: Array<Record<string, unknown>>): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      promises.push(ddb.send(new BatchWriteCommand({
        RequestItems: { [TABLE()]: requests.slice(i, i + BATCH_SIZE) },
      })));
    }
    await Promise.allSettled(promises);
  },
};
