import { describe, expect, it } from 'vitest';
import { handler } from '@/lambda/keepalive';
import type { WsEvent } from '@/shared/types';

describe('keepalive handler', () => {
  it('returns 200 regardless of event content', async () => {
    const result = await handler({} as WsEvent);
    expect(result).toEqual({ statusCode: 200, body: 'Connected.' });
  });
});
