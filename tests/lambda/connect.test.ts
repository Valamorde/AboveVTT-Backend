import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '@/lambda/connect';
import type { WsEvent } from '@/shared/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(connectionId: string, qs?: Record<string, string>): WsEvent {
  return {
    requestContext: {
      connectionId,
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      stage: 'v1',
      routeKey: '$connect',
      eventType: 'CONNECT',
      extendedRequestId: 'xxx',
      requestTime: '01/Jan/2025:00:00:00 +0000',
      messageDirection: 'IN',
      connectedAt: 0,
      requestTimeEpoch: 0,
      requestId: 'xxx',
      apiId: 'xxx',
    },
    queryStringParameters: qs,
  } as unknown as WsEvent;
}

describe('connect handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('stores DM connection with correct objectId pattern', async () => {
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(makeEvent('conn1', { campaign: 'camp1', DM: '1' }));
    expect(result).toEqual({ statusCode: 200, body: 'Connected.' });
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'abovevtt',
      Item: expect.objectContaining({ campaignId: 'camp1', objectId: 'conn#DM#conn1', connectionId: 'conn1' }),
    });
  });

  it('stores player connection with correct objectId pattern', async () => {
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(makeEvent('conn2', { campaign: 'camp1' }));
    expect(result).toEqual({ statusCode: 200, body: 'Connected.' });
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'abovevtt',
      Item: expect.objectContaining({ campaignId: 'camp1', objectId: 'conn#PLAYERS#conn2', connectionId: 'conn2' }),
    });
  });

  it('returns 500 on DDB error', async () => {
    ddbMock.on(PutCommand).rejects(new Error('DDB error'));
    const result = await handler(makeEvent('conn3', { campaign: 'camp1' }));
    expect(result).toMatchObject({ statusCode: 500 });
  });
});
