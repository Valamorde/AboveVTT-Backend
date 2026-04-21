import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '@/lambda/disconnect';
import type { WsEvent } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(connectionId: string): WsEvent {
  return {
    requestContext: {
      connectionId,
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      stage: 'v1',
      routeKey: '$disconnect',
      eventType: 'DISCONNECT',
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

describe('disconnect handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('queries GSI by connectionId then deletes each matching item', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ campaignId: 'camp1', objectId: 'conn#DM#conn1' }] });
    ddbMock.on(DeleteCommand).resolves({});
    const result = await handler(makeEvent('conn1'));
    expect(result).toEqual({ statusCode: 200, body: 'Disconnected.' });
    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      IndexName: 'connectionIds',
      KeyConditionExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: { ':connectionId': 'conn1' },
    });
    expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
      Key: { campaignId: 'camp1', objectId: 'conn#DM#conn1' },
    });
  });

  it('handles empty query result gracefully', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await handler(makeEvent('noconn'));
    expect(result).toEqual({ statusCode: 200, body: 'Disconnected.' });
    expect(ddbMock).not.toHaveReceivedCommand(DeleteCommand);
  });
});
