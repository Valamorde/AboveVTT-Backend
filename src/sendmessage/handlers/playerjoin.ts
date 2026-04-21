import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ddb } from '../../shared/db';
import { makeApigw } from '../../shared/apigw';
import { keys } from '../../shared/keys';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const playerjoinHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const apigw = makeApigw(event);

  const data = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { campaignId, objectId: keys.playerScene() },
  }));

  const sceneId = data.Item ? data.Item['data'] : null;
  console.log('sending back the message with the current scene data after a playerjoin');
  const message = { eventType: 'custom/myVTT/fetchscene', data: { sceneid: sceneId } };
  return apigw.send(new PostToConnectionCommand({
    ConnectionId: event.requestContext.connectionId,
    Data: JSON.stringify(message),
  }));
};
