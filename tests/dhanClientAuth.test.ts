import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DhanMarketDataApi } from '../src/dhanClient';

describe('Dhan REST authentication', () => {
    afterEach(() => vi.restoreAllMocks());

    it('rotates once and retries once after a 401 response', async () => {
        const post = vi.spyOn(axios, 'post')
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({ data: { ok: true } } as any);
        const tokenProvider = vi.fn().mockResolvedValue('old-token');
        const refresh = vi.fn().mockResolvedValue('new-token');
        const client = new DhanMarketDataApi('client', tokenProvider, false, refresh);

        const result = await (client as any).postWithAuth('https://example.test/data', {}, 1000);

        expect(result).toEqual({ ok: true });
        expect(refresh).toHaveBeenCalledWith('old-token');
        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls[0][2]?.headers).toMatchObject({ 'access-token': 'old-token' });
        expect(post.mock.calls[1][2]?.headers).toMatchObject({ 'access-token': 'new-token' });
    });

    it('does not retry non-authentication failures', async () => {
        vi.spyOn(axios, 'post').mockRejectedValueOnce({ response: { status: 429 } });
        const refresh = vi.fn();
        const client = new DhanMarketDataApi('client', 'token', false, refresh);

        await expect((client as any).postWithAuth('https://example.test/data', {}, 1000)).rejects.toMatchObject({
            response: { status: 429 },
        });
        expect(refresh).not.toHaveBeenCalled();
    });
});
