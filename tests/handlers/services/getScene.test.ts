import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getScene } from '@/handlers/services/getScene';
import type { ServiceContext } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('getScene', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('queries all scene items and assembles the response', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { objectId: 'scenes#s1#scenedata', data: { id: 's1', title: 'Tavern' } },
        { objectId: 'scenes#s1#fogdata', data: [[0, 0, 1, 1, 1, 0]] },
        { objectId: 'scenes#s1#drawdata', data: [] },
        { objectId: 'scenes#s1#tokens#tok1', data: { id: 'tok1', name: 'Goblin' } },
      ],
    });

    const ctx: ServiceContext = { campaignId: 'c1', sceneId: 's1', body: {} };
    const result = await getScene(ctx) as Record<string, unknown>;

    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      ExpressionAttributeValues: { ':hkey': 'c1', ':skey': 'scenes#s1' },
    });

    const sceneDatum = result['data'] as Record<string, unknown>;
    expect(sceneDatum.title).toBe('Tavern');
    expect(Array.isArray(sceneDatum.tokens)).toBe(true);
    expect((sceneDatum.tokens as unknown[]).length).toBe(1);
    expect(sceneDatum.reveals).toEqual([[0, 0, 1, 1, 1, 0]]);
    expect(sceneDatum.drawings).toEqual([]);
  });
});
