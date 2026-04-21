import type { APIGatewayProxyWebsocketHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// $connect events carry queryStringParameters — the base type omits them
export type WsEvent = Parameters<APIGatewayProxyWebsocketHandlerV2>[0] & {
  queryStringParameters?: Record<string, string | undefined> | null;
};
export type LambdaResult = APIGatewayProxyResultV2;

export interface VTTMessage {
  eventType: string;
  campaignId: string;
  cloud?: number;
  data?: Record<string, unknown>;
  sceneId?: string;
  playersSceneId?: string;
}

export type Handler = (event: WsEvent, msg: VTTMessage) => Promise<unknown>;

export interface ServiceContext {
  campaignId: string;
  sceneId: string;
  body: Record<string, unknown>;
}
