import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { switchSceneHandler } from '@/handlers/messages/switch-scene';
import type { WsEvent, VTTMessage } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const apigwMock = mockClient(ApiGatewayManagementApiClient);

function makeEvent(connectionId = 'dm1'): WsEvent {
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

describe('switchSceneHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('sends fetchscene to DM connections and stores dmscene when switch_dm=true', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ connectionId: 'dm1', objectId: 'conn#DM#dm1' }],
    });
    ddbMock.on(PutCommand).resolves({});
    apigwMock.on(PostToConnectionCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/switch_scene',
      campaignId: 'camp1',
      cloud: 1,
      data: { sceneId: 'scene99', switch_dm: true },
    };
    await switchSceneHandler(makeEvent(), msg);

    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'conn#DM#' },
    });
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      Item: expect.objectContaining({ objectId: 'dmscene', data: 'scene99' }),
    });
    const apigwCalls = apigwMock.commandCalls(PostToConnectionCommand);
    expect(apigwCalls).toHaveLength(1);
    const body = JSON.parse(apigwCalls[0].args[0].input.Data as string) as Record<string, unknown>;
    expect(body).toEqual({ eventType: 'custom/myVTT/fetchscene', data: { sceneid: 'scene99' } });
  });

  it('sends fetchscene to player connections and stores playerscene when switch_dm=false', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ connectionId: 'p1', objectId: 'conn#PLAYERS#p1' }],
    });
    ddbMock.on(PutCommand).resolves({});
    apigwMock.on(PostToConnectionCommand).resolves({});

    const msg: VTTMessage = {
      eventType: 'custom/myVTT/switch_scene',
      campaignId: 'camp1',
      cloud: 1,
      data: { sceneId: 'scene99' },
    };
    await switchSceneHandler(makeEvent(), msg);

    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      ExpressionAttributeValues: { ':hkey': 'camp1', ':skey': 'conn#PLAYERS#' },
    });
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      Item: expect.objectContaining({ objectId: 'playerscene', data: 'scene99' }),
    });
  });
});
