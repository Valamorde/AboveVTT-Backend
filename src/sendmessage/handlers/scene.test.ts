import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';

import { DynamoDBDocumentClient, QueryCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { deleteSceneHandler, updateSceneHandler } from './scene';
import type { WsEvent, VTTMessage } from '../../shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const apigwMock = mockClient(ApiGatewayManagementApiClient);

function makeEvent(connectionId = 'conn1'): WsEvent {
  return {
    body: '{}',
    requestContext: {
      connectionId,
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      stage: 'v1',
      routeKey: 'sendmessage',
      eventType: 'MESSAGE',
      extendedRequestId: 'xxx',
      requestTime: '01/Jan/2025:00:00:00 +0000',
      messageDirection: 'IN',
      connectedAt: 0,
      requestTimeEpoch: 0,
      requestId: 'xxx',
      apiId: 'xxx',
    },
  } as unknown as WsEvent;
}

describe('deleteSceneHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('batch-deletes all items under the scene prefix', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { objectId: 'scenes#s1#scenedata' },
        { objectId: 'scenes#s1#fogdata' },
        { objectId: 'scenes#s1#tokens#t1' },
      ],
    });
    ddbMock.on(BatchWriteCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/delete_scene',
      campaignId: 'camp1',
      cloud: 1,
      data: { id: 's1' },
    };

    await deleteSceneHandler(makeEvent(), msg);

    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'scenes#s1' },
    });
    expect(ddbMock).toHaveReceivedCommand(BatchWriteCommand);
  });
});

describe('updateSceneHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('persists scene data with correct objectId', async () => {
    ddbMock.on(PutCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/update_scene',
      campaignId: 'camp1',
      cloud: 1,
      data: { id: 's1', title: 'Forest' },
    };

    await updateSceneHandler(makeEvent(), msg);

    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      Item: expect.objectContaining({
        campaignId: 'camp1',
        objectId: 'scenes#s1#scenedata',
        sceneId: 's1',
      }),
    });
  });

  it('triggers switch_scene when sceneId matches DM current scene', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [{ connectionId: 'dm1', objectId: 'conn#DM#dm1' }] });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/update_scene',
      campaignId: 'camp1',
      cloud: 1,
      data: { id: 's1', title: 'Forest' },
      sceneId: 's1', // DM is on scene s1, so switch_scene fires
    };

    await updateSceneHandler(makeEvent(), msg);

    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'conn#DM#' },
    });
  });
});
