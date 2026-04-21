import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';

import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { tokenHandler, deleteTokenHandler } from './token';
import type { WsEvent, VTTMessage } from '../../shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

const stubEvent = {} as WsEvent;

describe('tokenHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('persists token with correct objectId key pattern', async () => {
    ddbMock.on(PutCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/token',
      campaignId: 'camp1',
      cloud: 1,
      sceneId: 'scene1',
      data: { id: 'tok1', name: 'Goblin' },
    };

    await tokenHandler(stubEvent, msg);

    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'abovevtt',
      Item: expect.objectContaining({
        campaignId: 'camp1',
        objectId: 'scenes#scene1#tokens#tok1',
        data: { id: 'tok1', name: 'Goblin' },
      }),
    });
  });
});

describe('deleteTokenHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('deletes token with correct objectId key pattern', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/delete_token',
      campaignId: 'camp1',
      cloud: 1,
      sceneId: 'scene1',
      data: { id: 'tok1' },
    };

    await deleteTokenHandler(stubEvent, msg);

    expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
      Key: { campaignId: 'camp1', objectId: 'scenes#scene1#tokens#tok1' },
    });
  });
});
