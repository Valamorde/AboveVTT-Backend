import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { connectionRepo } from '@/repositories/connection';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('connectionRepo', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  describe('put', () => {
    it('builds conn#DM# objectId for DM connections', async () => {
      ddbMock.on(PutCommand).resolves({});
      await connectionRepo.put('camp1', true, 'conn1');
      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        Item: expect.objectContaining({
          campaignId: 'camp1',
          objectId: 'conn#DM#conn1',
          connectionId: 'conn1',
        }),
      });
    });

    it('builds conn#PLAYERS# objectId for player connections', async () => {
      ddbMock.on(PutCommand).resolves({});
      await connectionRepo.put('camp1', false, 'conn2');
      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        Item: expect.objectContaining({ objectId: 'conn#PLAYERS#conn2' }),
      });
    });

    it('writes ttl field to the item', async () => {
      ddbMock.on(PutCommand).resolves({});
      const before = Math.floor(Date.now() / 1000);
      await connectionRepo.put('camp1', false, 'conn3');
      const after = Math.floor(Date.now() / 1000);
      const call = ddbMock.commandCalls(PutCommand)[0];
      const ttl = call.args[0].input.Item?.['ttl'] as number;
      expect(ttl).toBeGreaterThanOrEqual(before + 7200);
      expect(ttl).toBeLessThanOrEqual(after + 7200);
    });
  });

  describe('deleteById', () => {
    it('deletes the correct key', async () => {
      ddbMock.on(DeleteCommand).resolves({});
      await connectionRepo.deleteById('camp1', 'conn#DM#conn1');
      expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
        Key: { campaignId: 'camp1', objectId: 'conn#DM#conn1' },
      });
    });
  });

  describe('queryByCampaign', () => {
    it('queries with conn# prefix and returns items', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ campaignId: 'camp1', objectId: 'conn#DM#c1', connectionId: 'c1', timestamp: 0, ttl: 0 }],
      });
      const result = await connectionRepo.queryByCampaign('camp1');
      expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
        ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'conn#' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].connectionId).toBe('c1');
    });
  });

  describe('queryByType', () => {
    it('queries DM connections with conn#DM# prefix', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await connectionRepo.queryByType('camp1', true);
      expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
        ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'conn#DM#' },
      });
    });

    it('queries player connections with conn#PLAYERS# prefix', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await connectionRepo.queryByType('camp1', false);
      expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
        ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'conn#PLAYERS#' },
      });
    });
  });

  describe('findByConnectionId', () => {
    it('queries the connectionIds GSI', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await connectionRepo.findByConnectionId('conn99');
      expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
        IndexName: 'connectionIds',
        ExpressionAttributeValues: { ':connectionId': 'conn99' },
      });
    });
  });
});
