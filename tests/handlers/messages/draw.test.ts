import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { drawHandler } from '@/handlers/messages/draw';
import type { WsEvent, VTTMessage } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const stubEvent = {} as WsEvent;

describe('drawHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('persists draw data with correct objectId key pattern', async () => {
    ddbMock.on(PutCommand).resolves({});
    const drawData = [{ x: 0, y: 0, w: 100, h: 100 }];
    const msg: VTTMessage = {
      eventType: 'custom/myVTT/drawdata',
      campaignId: 'camp1',
      cloud: 1,
      sceneId: 'scene1',
      data: drawData as unknown as Record<string, unknown>,
    };

    await drawHandler(stubEvent, msg);

    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'abovevtt',
      Item: expect.objectContaining({
        campaignId: 'camp1',
        objectId: 'scenes#scene1#drawdata',
        data: drawData,
      }),
    });
  });
});
