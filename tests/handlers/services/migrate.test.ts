import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { migrate } from '@/handlers/services/migrate';
import type { ServiceContext } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('migrate', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('batch-writes all scene data and sets cloud flag', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const scenes = [
      {
        id: 'scene1',
        title: 'Forest',
        order: 1_000_000,
        reveals: [[0, 0, 1, 1, 1, 0]],
        drawings: [],
        tokens: { tok1: { id: 'tok1', name: 'Elf' } },
      },
    ];

    const ctx: ServiceContext = {
      campaignId: 'camp1',
      sceneId: '',
      body: scenes as unknown as Record<string, unknown>,
    };
    await migrate(ctx);

    expect(ddbMock).toHaveReceivedCommand(BatchWriteCommand);
    const allCalls = ddbMock.commandCalls(BatchWriteCommand);
    const allItems = allCalls.flatMap(c =>
      (c.args[0].input.RequestItems?.['abovevtt'] ?? [])
    );

    const objectIds = allItems
      .filter(r => 'PutRequest' in r)
      .map(r => (r as { PutRequest: { Item: Record<string, unknown> } }).PutRequest.Item['objectId'] as string);

    expect(objectIds).toContain('scenes#scene1#scenedata');
    expect(objectIds).toContain('scenes#scene1#fogdata');
    expect(objectIds).toContain('scenes#scene1#drawdata');
    expect(objectIds).toContain('scenes#scene1#tokens#tok1');
    expect(objectIds).toContain('campaigndata');
  });

  it('assigns generated ids to scenes missing one', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const scenes = [{ title: 'No ID Scene', reveals: [], drawings: [], tokens: {} }];
    const ctx: ServiceContext = {
      campaignId: 'camp1',
      sceneId: '',
      body: scenes as unknown as Record<string, unknown>,
    };
    await migrate(ctx);

    const allItems = ddbMock.commandCalls(BatchWriteCommand).flatMap(c =>
      (c.args[0].input.RequestItems?.['abovevtt'] ?? [])
    );
    const objectIds = allItems
      .filter(r => 'PutRequest' in r)
      .map(r => (r as { PutRequest: { Item: Record<string, unknown> } }).PutRequest.Item['objectId'] as string);

    expect(objectIds.some(id => id.startsWith('scenes#migrated'))).toBe(true);
  });
});
