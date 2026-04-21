import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '@/lambda/services';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(qs: Record<string, string>, body?: string): APIGatewayProxyEventV2 {
  return {
    queryStringParameters: qs,
    body,
    version: '2.0',
    routeKey: 'GET /services',
    rawPath: '/services',
    rawQueryString: '',
    headers: {},
    requestContext: {} as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('services handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'abovevtt';
  });

  it('getCampaignData calls GetCommand with correct key', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { campaignId: 'c1', objectId: 'campaigndata', data: { cloud: 1 } } });
    await handler(makeEvent({ action: 'getCampaignData', campaign: 'c1' }));
    expect(ddbMock).toHaveReceivedCommandWith(GetCommand, {
      TableName: 'abovevtt',
      Key: { campaignId: 'c1', objectId: 'campaigndata' },
    });
  });

  it('getCampaignData returns empty object on DDB error', async () => {
    ddbMock.on(GetCommand).rejects(new Error('DDB error'));
    const result = await handler(makeEvent({ action: 'getCampaignData', campaign: 'c1' }));
    expect(result).toEqual({});
  });

  it('setCampaignData calls PutCommand with correct Item', async () => {
    ddbMock.on(PutCommand).resolves({});
    await handler(makeEvent({ action: 'setCampaignData', campaign: 'c1' }, JSON.stringify({ cloud: 1 })));
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'abovevtt',
      Item: expect.objectContaining({ campaignId: 'c1', objectId: 'campaigndata', data: { cloud: 1 } }),
    });
  });

  it('getSceneList calls QueryCommand on sceneProperties GSI', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await handler(makeEvent({ action: 'getSceneList', campaign: 'c1' }));
    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      TableName: 'abovevtt',
      IndexName: 'sceneProperties',
      ExpressionAttributeValues: { ':hkey': 'c1' },
    });
  });

  it('getCurrentScene returns dmscene and playerscene fields', async () => {
    ddbMock.on(GetCommand, { Key: { campaignId: 'c1', objectId: 'dmscene' } }).resolves({ Item: { data: 'scene1' } });
    ddbMock.on(GetCommand, { Key: { campaignId: 'c1', objectId: 'playerscene' } }).resolves({ Item: { data: 'scene2' } });
    const result = await handler(makeEvent({ action: 'getCurrentScene', campaign: 'c1' }));
    expect(result).toEqual({ dmscene: 'scene1', playerscene: 'scene2' });
  });

  it('returns unknown action response for unrecognised action', async () => {
    const result = await handler(makeEvent({ action: 'badaction' }));
    expect(result).toEqual({ statusCode: 200, body: 'unknown action' });
  });
});
