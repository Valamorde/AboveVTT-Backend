import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';

import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { fogHandler } from './fog';
import type { WsEvent, VTTMessage } from '../../shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

const stubEvent = {} as WsEvent;

describe('fogHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('persists fog data with correct objectId key pattern', async () => {
    ddbMock.on(PutCommand).resolves({});

    const fogData = [[0, 0, 100, 100, 1, 0]];
    const msg: VTTMessage = {
      eventType: 'custom/myVTT/fogdata',
      campaignId: 'camp1',
      cloud: 1,
      sceneId: 'scene1',
      data: fogData as unknown as Record<string, unknown>,
    };

    await fogHandler(stubEvent, msg);

    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'abovevtt',
      Item: expect.objectContaining({
        campaignId: 'camp1',
        objectId: 'scenes#scene1#fogdata',
        data: fogData,
      }),
    });
  });
});
