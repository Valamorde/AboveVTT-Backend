import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { handler } from '@/lambda/sendmessage';
import type { WsEvent } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);
const apigwMock = mockClient(ApiGatewayManagementApiClient);

function makeEvent(body: object, connectionId = 'conn1'): WsEvent {
  return {
    body: JSON.stringify(body),
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

describe('sendmessage handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    apigwMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('returns 200 immediately for keepalive without touching DDB', async () => {
    const result = await handler(makeEvent({ eventType: 'custom/myVTT/keepalive', campaignId: 'c1' }));
    expect(result).toEqual({ statusCode: 200, body: 'Data sent.' });
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it('forwards a non-cloud message without invoking the domain handler', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ connectionId: 'other', objectId: 'conn#PLAYERS#other', timestamp: Date.now() }] });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const result = await handler(makeEvent({ eventType: 'custom/myVTT/token', campaignId: 'c1', cloud: 0 }));

    expect(result).toEqual({ statusCode: 200, body: 'Data sent.' });
    // PutCommand (token persistence) must NOT be called — cloud=0 skips handler
    expect(ddbMock).not.toHaveReceivedCommand(PutCommand);
    // PostToConnection IS called (forwarding still happens)
    expect(apigwMock).toHaveReceivedCommand(PostToConnectionCommand);
  });

  it('invokes domain handler AND forwards for a cloud token message', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    apigwMock.on(PostToConnectionCommand).resolves({});

    const result = await handler(makeEvent({
      eventType: 'custom/myVTT/token',
      campaignId: 'c1',
      cloud: 1,
      sceneId: 's1',
      data: { id: 'tok1' },
    }));

    expect(result).toEqual({ statusCode: 200, body: 'Data sent.' });
    // PutCommand called for token persistence
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      Item: expect.objectContaining({ objectId: 'scenes#s1#tokens#tok1' }),
    });
  });

  it('suppresses forwarding for switch_scene when cloud=1', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    apigwMock.on(PostToConnectionCommand).resolves({});

    await handler(makeEvent({
      eventType: 'custom/myVTT/switch_scene',
      campaignId: 'c1',
      cloud: 1,
      data: { sceneId: 's1', switch_dm: true },
    }));

    // QueryCommand is called by switchSceneHandler (getting DM connections), not by forwardMessage
    // We verify the right query — DM type query, not the broad conn# prefix query
    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      ExpressionAttributeValues: { ':hkey': 'c1', ':skey': 'conn#DM#' },
    });
    // No broad connection list query (forwardMessage not called)
    const queryCalls = ddbMock.commandCalls(QueryCommand);
    const broadQuery = queryCalls.find(c =>
      c.args[0].input.ExpressionAttributeValues?.[':skey'] === 'conn#'
    );
    expect(broadQuery).toBeUndefined();
  });
});
