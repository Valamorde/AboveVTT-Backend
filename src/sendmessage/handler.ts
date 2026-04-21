import type { WsEvent, LambdaResult, VTTMessage, Handler } from '../shared/types';
import { forwardMessage } from './handlers/forward';
import { dmjoinHandler } from './handlers/dmjoin';
import { playerjoinHandler } from './handlers/playerjoin';
import { switchSceneHandler } from './handlers/switch-scene';
import { tokenHandler, deleteTokenHandler } from './handlers/token';
import { deleteSceneHandler, updateSceneHandler } from './handlers/scene';
import { fogHandler } from './handlers/fog';
import { drawHandler } from './handlers/draw';

const handlers: Record<string, Handler> = {
  'custom/myVTT/dmjoin':       dmjoinHandler,
  'custom/myVTT/playerjoin':   playerjoinHandler,
  'custom/myVTT/switch_scene': switchSceneHandler,
  'custom/myVTT/token':        tokenHandler,
  'custom/myVTT/delete_token': deleteTokenHandler,
  'custom/myVTT/delete_scene': deleteSceneHandler,
  'custom/myVTT/fogdata':      fogHandler,
  'custom/myVTT/drawdata':     drawHandler,
  'custom/myVTT/update_scene': updateSceneHandler,
};

// These event types suppress broadcasting when cloud == 1
const NO_FORWARD = new Set(['custom/myVTT/switch_scene', 'custom/myVTT/update_scene']);

export const handler = async (event: WsEvent): Promise<LambdaResult> => {
  const msg = JSON.parse(event.body!) as VTTMessage;

  if (msg.eventType === 'custom/myVTT/keepalive')
    return { statusCode: 200, body: 'Data sent.' };

  const { campaignId, eventType, cloud } = msg;
  const isCloud = cloud == 1;

  console.log(`Campaign ${campaignId} Event: ${eventType} requestTimeEpoch: ${event.requestContext.requestTimeEpoch}`);

  const promises: Promise<unknown>[] = [];

  const h = handlers[eventType];
  if (isCloud && h) {
    promises.push(h(event, msg));
  }

  const suppressesForward = isCloud && NO_FORWARD.has(eventType);
  if (!suppressesForward) {
    promises.push(forwardMessage(event, msg));
  }

  try {
    await Promise.allSettled(promises);
  } catch (err) {
    console.log('Oh Oh. Something wrong');
    console.log(err);
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
  }

  console.log('finished');
  return { statusCode: 200, body: 'Data sent.' };
};
