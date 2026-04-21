import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { connectionRepo } from '../../shared/repositories/connection';
import { sceneRepo } from '../../shared/repositories/scene';
import { makeApigw } from '../../shared/apigw';
import type { WsEvent, VTTMessage, Handler } from '../../shared/types';

export const switchSceneHandler: Handler = async (event: WsEvent, msg: VTTMessage): Promise<unknown> => {
  const data = msg.data ?? {};
  const sceneId = data['sceneId'] as string;
  const { campaignId } = msg;
  const switchDm = !!data['switch_dm'];

  console.log(`executing switch_scene, searching for ${campaignId} and scene ${sceneId}`);

  const connections = await connectionRepo.queryByType(campaignId, switchDm);

  console.log('Got connectiondata');
  const apigw = makeApigw(event);
  const message = { eventType: 'custom/myVTT/fetchscene', data: { sceneid: sceneId } };

  const promises: Promise<unknown>[] = connections.map(item =>
    apigw.send(new PostToConnectionCommand({
      ConnectionId: item.connectionId,
      Data: JSON.stringify(message),
    })).catch(() => { /* stale connection, ignore */ })
  );

  promises.push(
    switchDm
      ? sceneRepo.setDmScene(campaignId, sceneId)
      : sceneRepo.setPlayerScene(campaignId, sceneId)
  );

  return Promise.allSettled(promises);
};
