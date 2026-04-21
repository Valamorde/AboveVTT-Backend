import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { sceneRepo } from '../../repositories/scene';
import { makeApigw } from '../../shared/apigw';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const playerjoinHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const { campaignId } = msg;
  const apigw = makeApigw(event);

  const sceneId = await sceneRepo.getPlayerScene(campaignId);

  console.log('sending back the message with the current scene data after a playerjoin');
  const message = { eventType: 'custom/myVTT/fetchscene', data: { sceneid: sceneId } };
  return apigw.send(new PostToConnectionCommand({
    ConnectionId: event.requestContext.connectionId,
    Data: JSON.stringify(message),
  }));
};
