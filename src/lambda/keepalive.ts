import type { WsEvent, LambdaResult } from '../shared/types';

export const handler = async (_event: WsEvent): Promise<LambdaResult> => {
  return { statusCode: 200, body: 'Connected.' };
};
