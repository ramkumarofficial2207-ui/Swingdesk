import { describe, expect, it } from 'vitest';
import { DhanWebSocketClient } from '../src/dhanWebSocket';
import { liveTickerStore } from '../src/liveTickerStore';

describe('Dhan full-packet parsing', () => {
    it('accepts an access-token rotation without replacing the client', () => {
        const client = new DhanWebSocketClient({ clientId: 'test', accessToken: 'old-token' });
        client.updateAccessToken('new-token');
        expect((client as any).accessToken).toBe('new-token');
    });

    it('reads cumulative volume and day high/low from documented offsets', () => {
        const securityId = '987654';
        const client = new DhanWebSocketClient({ clientId: 'test', accessToken: 'test' });
        const packet = Buffer.alloc(163);

        packet.writeUInt8(8, 0); // Full packet response code
        packet.writeInt32LE(Number(securityId), 4);
        packet.writeFloatLE(125.5, 8); // LTP
        packet.writeFloatLE(124.25, 18); // average trade price
        packet.writeInt32LE(450000, 22); // cumulative volume
        packet.writeFloatLE(121.5, 46); // day open
        packet.writeFloatLE(130.25, 54); // day high
        packet.writeFloatLE(119.75, 58); // day low

        (client as any).handleMessage(packet);
        const tick = liveTickerStore.getTick(securityId);

        expect(tick).toMatchObject({
            ltp: 125.5,
            volume: 450000,
            dayHigh: 130.25,
            dayLow: 119.75,
            dayOpen: 121.5,
            averageTradePrice: 124.25,
        });
    });
});
