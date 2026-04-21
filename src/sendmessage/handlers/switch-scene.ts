import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ddb } from '../../shared/db';
import { makeApigw } from '../../shared/apigw';
import { keys } from '../../shared/keys';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const switchSceneHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const data = msg.data ?? {};
  const sceneId = data['sceneId'] as string;
  const { campaignId } = msg;
  const switchDm = !!data['switch_dm'];

  console.log(`executing switch_scene, searching for ${campaignId} and scene ${sceneId}`);

  const connectionData = await ddb.send(new QueryCommand({
    TableName: process.env.TABLE_NAME,
    KeyConditionExpression: 'campaignId = :hkey and begins_with(objectId,:skey)',
    ExpressionAttributeValues: {
      ':hkey': campaignId,
      ':skey': keys.connByType(switchDm),
    },
  }));

  console.log('Got connectiondata');
  const apigw = makeApigw(event);
  const message = { eventType: 'custom/myVTT/fetchscene', data: { sceneid: sceneId } };

  const promises = (connectionData.Items ?? []).map(item =>
    apigw.send(new PostToConnectionCommand({
      ConnectionId: item['connectionId'] as string,
      Data: JSON.stringify(message),
    })).catch(() => { /* stale connection, ignore */ })
  );

  promises.push(ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: { campaignId, objectId: switchDm ? keys.dmScene() : keys.playerScene(), data: sceneId },
  })));

  return Promise.allSettled(promises);
};
