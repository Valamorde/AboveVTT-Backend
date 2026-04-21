import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/db';
import { keys } from '../shared/keys';

const TABLE = (): string => process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEventV2): Promise<unknown> => {
  const action = event.queryStringParameters?.action ?? '';

  if (action === 'getCampaignData') {
    const campaignId = event.queryStringParameters?.campaign ?? '';
    return ddb.send(new GetCommand({
      TableName: TABLE(),
      Key: { campaignId, objectId: keys.campaignData() },
    })).catch(() => ({}));
  }

  if (action === 'setCampaignData') {
    const campaignId = event.queryStringParameters?.campaign ?? '';
    console.log('logging full event diocane');
    console.log(event);
    const campaignData = JSON.parse(event.body ?? '{}') as unknown;
    return ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: {
        campaignId,
        objectId: keys.campaignData(),
        data: campaignData,
        timestamp: Date.now(),
      },
    }));
  }

  if (action === 'migrate') {
    console.log('GOT A MIGRATION REQUEST!');
    const campaignId = event.queryStringParameters?.campaign ?? '';
    const scenes = JSON.parse(event.body ?? '[]') as Array<Record<string, unknown>>;
    console.log(scenes);
    const requests: Array<Record<string, unknown>> = [];

    let nextorder = 1000000;
    let nextid = 100;
    scenes.forEach(scene => {
      const fogData = scene.reveals;
      const drawData = scene.drawings;
      const tokens = scene.tokens as Record<string, unknown>;
      scene.reveals = [];
      scene.drawings = [];
      scene.tokens = {};

      if (!scene.order) {
        scene.order = nextorder;
        nextorder += 1000000;
      }
      if (!scene.id) {
        scene.id = `migrated${nextid}`;
        nextid += 100;
      }

      const sceneId = scene.id as string;
      requests.push({ PutRequest: { Item: { campaignId, objectId: keys.sceneData(sceneId), sceneId, data: scene, timestamp: Date.now() } } });
      requests.push({ PutRequest: { Item: { campaignId, objectId: keys.fogData(sceneId), data: fogData, timestamp: Date.now() } } });
      requests.push({ PutRequest: { Item: { campaignId, objectId: keys.drawData(sceneId), data: drawData, timestamp: Date.now() } } });

      for (const tokenid in tokens) {
        requests.push({ PutRequest: { Item: { campaignId, objectId: keys.tokenData(sceneId, tokenid), data: tokens[tokenid], timestamp: Date.now() } } });
      }
    });

    requests.push({ PutRequest: { Item: { campaignId, objectId: keys.campaignData(), data: { cloud: 1 }, timestamp: Date.now() } } });

    console.log('preparing the batch writes');
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < requests.length; i += 25) {
      const currentBatch = requests.slice(i, i + 25);
      console.log(`adding batch with index ${i}`);
      promises.push(ddb.send(new BatchWriteCommand({
        RequestItems: { [TABLE()]: currentBatch },
      })));
    }
    await Promise.allSettled(promises).then(results => { console.log(results); });
    return { statusCode: 200, body: 'Migrated' };
  }

  if (action === 'export_scenes') {
    const campaignId = event.queryStringParameters?.campaign ?? '';

    const queryReply = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      IndexName: 'sceneProperties',
      KeyConditionExpression: 'campaignId = :hkey',
      ExpressionAttributeValues: { ':hkey': campaignId },
    }));

    const export_data: unknown[] = [];
    const scenelist = (queryReply.Items ?? []).map(el => el['data'] as Record<string, unknown>);

    const promises = scenelist.map(scene => {
      const sceneId = scene.id as string;
      scene.tokens = {};
      scene.reveals = [];
      scene.drawings = [];

      return ddb.send(new QueryCommand({
        TableName: TABLE(),
        KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
        ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.scenePrefix(sceneId) },
      })).then(sceneObjects => {
        const items = sceneObjects.Items ?? [];
        items
          .filter(el => (el['objectId'] as string).startsWith(keys.scenePrefix(sceneId) + '#tokens#'))
          .forEach(el => {
            const data = el['data'] as Record<string, unknown>;
            (scene.tokens as Record<string, unknown>)[data.id as string] = data;
          });

        const fogdata = items.find(el => el['objectId'] === keys.fogData(sceneId));
        if (fogdata?.['data']) scene.reveals = fogdata['data'] as unknown[];

        const drawdata = items.find(el => el['objectId'] === keys.drawData(sceneId));
        if (drawdata?.['data']) scene.drawings = drawdata['data'] as unknown[];

        export_data.push(scene);
      });
    });

    await Promise.allSettled(promises);
    return { statusCode: 200, body: JSON.stringify(export_data) };
  }

  if (action === 'getScene') {
    const campaignId = event.queryStringParameters?.campaign ?? '';
    const sceneId = event.queryStringParameters?.scene ?? '';

    const data = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
      ExpressionAttributeValues: { ':hkey': campaignId, ':skey': keys.scenePrefix(sceneId) },
    }));

    console.log('got SceneData');
    const items = data.Items ?? [];
    const sceneData = items.find(el => el['objectId'] === keys.sceneData(sceneId)) as Record<string, unknown>;
    const sceneDatum = sceneData['data'] as Record<string, unknown>;

    sceneDatum.tokens = items
      .filter(el => (el['objectId'] as string).startsWith(keys.scenePrefix(sceneId) + '#tokens#'))
      .map(el => el['data']);

    const fogdata = items.find(el => el['objectId'] === keys.fogData(sceneId));
    sceneDatum.reveals = fogdata?.['data'] ?? [];

    const drawdata = items.find(el => el['objectId'] === keys.drawData(sceneId));
    sceneDatum.drawings = drawdata?.['data'] ?? [];

    console.log('returning SceneData');
    return sceneData;
  }

  if (action === 'getSceneList') {
    const campaignId = event.queryStringParameters?.campaign ?? '';
    return ddb.send(new QueryCommand({
      TableName: TABLE(),
      IndexName: 'sceneProperties',
      KeyConditionExpression: 'campaignId = :hkey',
      ExpressionAttributeValues: { ':hkey': campaignId },
    }));
  }

  if (action === 'getCurrentScene') {
    const campaignId = event.queryStringParameters?.campaign ?? '';
    const [dmResult, playerResult] = await Promise.all([
      ddb.send(new GetCommand({ TableName: TABLE(), Key: { campaignId, objectId: keys.dmScene() } })),
      ddb.send(new GetCommand({ TableName: TABLE(), Key: { campaignId, objectId: keys.playerScene() } })),
    ]);
    return {
      dmscene: dmResult.Item ? dmResult.Item['data'] : '',
      playerscene: playerResult.Item ? playerResult.Item['data'] : '',
    };
  }

  return { statusCode: 200, body: 'unknown action' };
};
