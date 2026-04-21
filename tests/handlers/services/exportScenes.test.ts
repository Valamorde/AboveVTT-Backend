import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { exportScenes } from '@/handlers/services/exportScenes';
import type { ServiceContext } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('exportScenes', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('assembles scenes with tokens, fog, and draw data from sub-items', async () => {
    // First query: sceneProperties GSI returns the scene list
    ddbMock.on(QueryCommand, { IndexName: 'sceneProperties' }).resolves({
      Items: [{ sceneId: 's1', data: { id: 's1', title: 'Dungeon' } }],
    });
    // Second query: per-scene bundle query
    ddbMock.on(QueryCommand, { ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'scenes#s1' } }).resolves({
      Items: [
        { objectId: 'scenes#s1#scenedata', data: { id: 's1', title: 'Dungeon' } },
        { objectId: 'scenes#s1#fogdata', data: [[0, 0, 1, 1, 1, 0]] },
        { objectId: 'scenes#s1#drawdata', data: [{ x: 1 }] },
        { objectId: 'scenes#s1#tokens#tok1', data: { id: 'tok1', name: 'Orc' } },
      ],
    });

    const ctx: ServiceContext = { campaignId: 'camp1', sceneId: '', body: {} };
    const result = await exportScenes(ctx) as { statusCode: number; body: string };

    expect(result.statusCode).toBe(200);
    const scenes = JSON.parse(result.body) as Array<Record<string, unknown>>;
    expect(scenes).toHaveLength(1);
    const scene = scenes[0];
    expect(scene.reveals).toEqual([[0, 0, 1, 1, 1, 0]]);
    expect(scene.drawings).toEqual([{ x: 1 }]);
    const tokens = scene.tokens as Record<string, unknown>;
    expect(tokens['tok1']).toEqual({ id: 'tok1', name: 'Orc' });
  });

  it('returns empty array when campaign has no scenes', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const ctx: ServiceContext = { campaignId: 'camp1', sceneId: '', body: {} };
    const result = await exportScenes(ctx) as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });
});
