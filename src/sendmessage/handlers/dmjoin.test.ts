import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';

import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { dmjoinHandler } from './dmjoin';
import type { WsEvent, VTTMessage } from '../../shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const apigwMock = mockClient(ApiGatewayManagementApiClient);

function makeEvent(connectionId: string): WsEvent {
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

describe('dmjoinHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('sends scene list and fetchscene to DM connection', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ sceneId: 's1', data: { id: 's1', title: 'Room' } }],
    });
    ddbMock.on(GetCommand, { Key: { campaignId: 'camp1', objectId: 'playerscene' } }).resolves({ Item: { data: 's1' } });
    ddbMock.on(GetCommand, { Key: { campaignId: 'camp1', objectId: 'dmscene' } }).resolves({ Item: { data: 's1' } });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const msg: VTTMessage = { eventType: 'custom/myVTT/dmjoin', campaignId: 'camp1', cloud: 1 };
    await dmjoinHandler(makeEvent('dmconn'), msg);

    const calls = apigwMock.commandCalls(PostToConnectionCommand);
    expect(calls.length).toBeGreaterThanOrEqual(2);

    const bodies = calls.map(c => JSON.parse(c.args[0].input.Data as string) as Record<string, unknown>);
    expect(bodies.some(b => b.eventType === 'custom/myVTT/scenelist')).toBe(true);
    expect(bodies.some(b => b.eventType === 'custom/myVTT/fetchscene')).toBe(true);
  });
});
