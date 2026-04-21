import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { playerjoinHandler } from '@/handlers/messages/playerjoin';
import type { WsEvent, VTTMessage } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const apigwMock = mockClient(ApiGatewayManagementApiClient);

function makeEvent(connectionId = 'player1'): WsEvent {
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

describe('playerjoinHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('sends fetchscene with the stored player scene id', async () => {
    ddbMock.on(GetCommand, { Key: { campaignId: 'camp1', objectId: 'playerscene' } })
      .resolves({ Item: { data: 'scene42' } });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const msg: VTTMessage = { eventType: 'custom/myVTT/playerjoin', campaignId: 'camp1', cloud: 1 };
    await playerjoinHandler(makeEvent('player1'), msg);

    const calls = apigwMock.commandCalls(PostToConnectionCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.ConnectionId).toBe('player1');
    const body = JSON.parse(calls[0].args[0].input.Data as string) as Record<string, unknown>;
    expect(body).toEqual({ eventType: 'custom/myVTT/fetchscene', data: { sceneid: 'scene42' } });
  });

  it('sends fetchscene with null sceneid when no player scene is set', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const msg: VTTMessage = { eventType: 'custom/myVTT/playerjoin', campaignId: 'camp1', cloud: 1 };
    await playerjoinHandler(makeEvent('player1'), msg);

    const calls = apigwMock.commandCalls(PostToConnectionCommand);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].args[0].input.Data as string) as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;
    expect(data.sceneid).toBeNull();
  });
});
