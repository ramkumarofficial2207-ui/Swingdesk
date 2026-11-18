import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { liveTickerStore } from './liveTickerStore';
import { getCurrentDhanAccessToken, isDhanAuthConfigured } from './dhanTokenManager';

const DHAN_WS_URL = 'wss://api-feed.dhan.co';

export interface DhanWsConfig {
    clientId: string;
    accessToken: string;
}

export class DhanWebSocketClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private clientId: string;
    private accessToken: string;
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private maxReconnectDelay = 30000;
    private rateLimited = false;
    private subscribedSecurityIds = new Set<string>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private shouldReconnect = false;
    private tokenRotationPending = false;

    constructor(config: DhanWsConfig) {
        super();
        this.clientId = config.clientId;
        this.accessToken = config.accessToken;
    }

    /**
     * Connect to Dhan HQ Market Feed WebSocket
     */
    public connect(): void {
        if (!this.accessToken) {
            console.warn('[Dhan WS] Access token is unavailable; connection deferred.');
            return;
        }
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            console.log('[Dhan WS] Already connected or connecting.');
            return;
        }

        this.shouldReconnect = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;

        const url = `${DHAN_WS_URL}?version=2&token=${encodeURIComponent(this.accessToken)}&clientId=${encodeURIComponent(this.clientId)}&authType=2`;

        console.log('[Dhan WS] 🔌 Connecting to Dhan HQ Live Market Feed...');
        const socket = new WebSocket(url);
        this.ws = socket;

        socket.on('open', () => {
            console.log('[Dhan WS] 🟢 Connected to Dhan HQ Live Feed!');
            this.reconnectAttempts = 0;
            this.isReconnecting = false;
            this.rateLimited = false;
            this.emit('connected');

            // Re-subscribe all queued security IDs on reconnect
            if (this.subscribedSecurityIds.size > 0) {
                console.log(`[Dhan WS] 🔄 Resubscribing ${this.subscribedSecurityIds.size} securities...`);
                this.sendSubscriptionRequest(Array.from(this.subscribedSecurityIds));
            }
        });

        socket.on('message', (data: WebSocket.Data) => {
            this.handleMessage(data);
        });

        socket.on('error', (err: Error) => {
            if (/429|too many requests|rate limit/i.test(err.message)) {
                this.rateLimited = true;
            }
            const safeMessage = err.message.replace(/token=[^&\s]+/gi, 'token=[redacted]');
            console.warn('[Dhan WS] ⚠️ Connection notice:', safeMessage);
            if (this.listenerCount('error') > 0) {
                this.emit('error', err);
            }
        });

        socket.on('close', (code: number, reason: Buffer) => {
            const ownedConnection = this.ws === socket;
            if (ownedConnection) this.ws = null;
            console.warn(`[Dhan WS] 🔴 Connection closed (code: ${code}).`);
            this.emit('disconnected');
            if (!ownedConnection) return;
            if (!this.shouldReconnect) return;
            if (this.tokenRotationPending) {
                this.tokenRotationPending = false;
                this.scheduleReconnect(250);
                return;
            }
            this.scheduleReconnect();
        });
    }

    /**
     * Subscribe to live feeds for security IDs (Dhan internal security ID, e.g. "2885")
     */
    public subscribe(securityIds: string[]): void {
        const newIds = securityIds.filter(id => !this.subscribedSecurityIds.has(id));
        if (newIds.length === 0) return;

        newIds.forEach(id => this.subscribedSecurityIds.add(id));

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendSubscriptionRequest(newIds);
        }
    }

    private sendSubscriptionRequest(securityIds: string[]): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Dhan HQ RequestCode 21 = Full Packet (LTP, volume, day high/low).
        const payload = {
            RequestCode: 21,
            InstrumentCount: securityIds.length,
            InstrumentList: securityIds.map(id => ({
                ExchangeSegment: 'NSE_EQ',
                SecurityId: String(id),
            })),
        };

        try {
            this.ws.send(JSON.stringify(payload));
            console.log(`[Dhan WS] 📡 Subscribed to ${securityIds.length} securities via WebSocket`);
        } catch (e: any) {
            console.error('[Dhan WS] Failed to send subscription payload:', e.message);
        }
    }

    /**
     * Unsubscribe from security IDs
     */
    public unsubscribe(securityIds: string[]): void {
        securityIds.forEach(id => this.subscribedSecurityIds.delete(id));
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                RequestCode: 22, // Code 22 = Unsubscribe
                InstrumentCount: securityIds.length,
                InstrumentList: securityIds.map(id => ({
                    ExchangeSegment: 'NSE_EQ',
                    SecurityId: String(id),
                })),
            };
            this.ws.send(JSON.stringify(payload));
        }
    }

    /**
     * Parse binary / JSON packet frames from Dhan HQ feed
     */
    private handleMessage(data: WebSocket.Data): void {
        try {
            // Case 1: JSON frame
            if (typeof data === 'string') {
                const parsed = JSON.parse(data);
                if (parsed.securityId || parsed.SecurityId) {
                    const secId = String(parsed.securityId || parsed.SecurityId);
                    const ltp = parseFloat(parsed.LTP || parsed.ltp || parsed.last_price || 0);
                    if (ltp > 0) {
                        liveTickerStore.updateTick({
                            securityId: secId,
                            ltp,
                            dayHigh: parsed.dayHigh ? parseFloat(parsed.dayHigh) : undefined,
                            dayLow: parsed.dayLow ? parseFloat(parsed.dayLow) : undefined,
                            dayOpen: parsed.dayOpen || parsed.open ? parseFloat(parsed.dayOpen || parsed.open) : undefined,
                            averageTradePrice: parsed.averageTradePrice || parsed.average_price
                                ? parseFloat(parsed.averageTradePrice || parsed.average_price)
                                : undefined,
                            volume: parsed.volume ? parseInt(parsed.volume) : undefined,
                        });
                    }
                }
                return;
            }

            // Case 2: Binary Buffer frame (Dhan Packet Format)
            if (Buffer.isBuffer(data)) {
                if (data.length < 8) return;

                // Dhan Feed Type Header
                const feedType = data.readUInt8(0);
                
                // Response header is 8 bytes. Quote data (4) and Full data
                // (8) carry cumulative session volume; ticker data (2) does
                // not. Offsets follow Dhan's v2 packet layout.
                if (data.length >= 16) {
                    const securityId = data.readInt32LE(4).toString();
                    const ltp = data.readFloatLE(8);

                    if (feedType === 6) {
                        const ticker = liveTickerStore.getTickerForSecurityId(securityId);
                        if (ticker && ltp > 0) liveTickerStore.setIndicators(ticker, { prevClose: ltp });
                        return;
                    }
                    
                    if (ltp > 0 && ltp < 1000000) {
                        let dayHigh: number | undefined;
                        let dayLow: number | undefined;
                        let dayOpen: number | undefined;
                        let averageTradePrice: number | undefined;
                        let volume: number | undefined;

                        if (feedType === 4 && data.length >= 50) {
                            // Dhan v2 Quote: ATP [19-22], volume [23-26],
                            // open [35-38], high [43-46], low [47-50].
                            averageTradePrice = data.readFloatLE(18);
                            volume = data.readInt32LE(22);
                            dayOpen = data.readFloatLE(34);
                            dayHigh = data.readFloatLE(42);
                            dayLow = data.readFloatLE(46);
                        } else if (feedType === 8 && data.length >= 63) {
                            // Dhan v2 Full: ATP [19-22], volume [23-26],
                            // open [47-50], high [55-58], low [59-62].
                            averageTradePrice = data.readFloatLE(18);
                            volume = data.readInt32LE(22);
                            dayOpen = data.readFloatLE(46);
                            dayHigh = data.readFloatLE(54);
                            dayLow = data.readFloatLE(58);
                        }

                        liveTickerStore.updateTick({
                            securityId,
                            ltp,
                            dayHigh,
                            dayLow,
                            dayOpen,
                            averageTradePrice,
                            volume,
                        });
                    }
                }
            }
        } catch (err: any) {
            // Ignore malformed frames silently
        }
    }

    private scheduleReconnect(delayOverride?: number): void {
        if (!this.shouldReconnect || this.isReconnecting || this.reconnectTimer) return;
        this.isReconnecting = true;
        this.reconnectAttempts++;

        const initialDelay = this.rateLimited ? 30_000 : 1_000;
        const maxDelay = this.rateLimited ? 5 * 60_000 : this.maxReconnectDelay;
        const delay = delayOverride ?? Math.min(initialDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
        console.log(`[Dhan WS] Reconnecting in ${(delay / 1000).toFixed(1)}s (Attempt #${this.reconnectAttempts})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.isReconnecting = false;
            this.connect();
        }, delay);
    }

    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /** Rotate credentials without losing the subscription set. */
    public updateAccessToken(accessToken: string): void {
        const normalized = accessToken.trim();
        if (!normalized || normalized === this.accessToken) return;
        this.accessToken = normalized;
        this.rateLimited = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
            this.isReconnecting = false;
        }
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            this.tokenRotationPending = true;
            this.shouldReconnect = true;
            this.ws.close(1000, 'access token rotated');
            return;
        }
        if (this.shouldReconnect) this.connect();
    }

    public disconnect(): void {
        this.shouldReconnect = false;
        this.tokenRotationPending = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Global Singleton Instance
let dhanWsInstance: DhanWebSocketClient | null = null;

export function getDhanWebSocketInstance(): DhanWebSocketClient | null {
    if (dhanWsInstance) return dhanWsInstance;

    const clientId = process.env.DHAN_CLIENT_ID;
    const accessToken = getCurrentDhanAccessToken() || process.env.DHAN_ACCESS_TOKEN;

    if (!clientId || !accessToken || !isDhanAuthConfigured()) {
        console.warn('[Dhan WS] Managed Dhan authentication is not ready.');
        return null;
    }

    dhanWsInstance = new DhanWebSocketClient({ clientId, accessToken });
    return dhanWsInstance;
}
