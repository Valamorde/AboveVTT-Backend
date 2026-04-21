import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';

import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { forwardMessage } from '@/handlers/messages/forward';
import type { WsEvent, VTTMessage } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const apigwMock = mockClient(ApiGatewayManagementApiClient);

const now = Date.now();

function makeEvent(connectionId: string, body: string): WsEvent {
  return {
    body,
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
      requestTimeEpoch: now,
      requestId: 'xxx',
      apiId: 'xxx',
    },
  } as unknown as WsEvent;
}

describe('forwardMessage', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('broadcasts to all connections except the sender', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { objectId: 'conn#DM#sender', connectionId: 'sender', timestamp: now },
        { objectId: 'conn#PLAYERS#p1', connectionId: 'p1', timestamp: now - 1000 },
        { objectId: 'conn#PLAYERS#p2', connectionId: 'p2', timestamp: now - 2000 },
      ],
    });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const body = JSON.stringify({ eventType: 'custom/myVTT/token', campaignId: 'camp1', cloud: 1 });
    const msg: VTTMessage = { eventType: 'custom/myVTT/token', campaignId: 'camp1', cloud: 1 };

    await forwardMessage(makeEvent('sender', body), msg);

    expect(apigwMock).toHaveReceivedCommandTimes(PostToConnectionCommand, 2);
    expect(apigwMock).toHaveReceivedNthCommandWith(PostToConnectionCommand, 1, { ConnectionId: 'p1' });
    expect(apigwMock).toHaveReceivedNthCommandWith(PostToConnectionCommand, 2, { ConnectionId: 'p2' });
  });

  it('deletes stale connections on 410 error', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ objectId: 'conn#PLAYERS#gone', connectionId: 'gone', timestamp: now }],
    });
    apigwMock.on(PostToConnectionCommand).rejects(
      Object.assign(new Error('Gone'), { $metadata: { httpStatusCode: 410 } })
    );
    ddbMock.on(DeleteCommand).resolves({});

    const body = JSON.stringify({ eventType: 'custom/myVTT/token', campaignId: 'camp1' });
    const msg: VTTMessage = { eventType: 'custom/myVTT/token', campaignId: 'camp1' };

    await forwardMessage(makeEvent('sender', body), msg);

    expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
      Key: { campaignId: 'camp1', objectId: 'conn#PLAYERS#gone' },
    });
  });
});
