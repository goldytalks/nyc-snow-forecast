/**
 * Kalshi WebSocket Client for Real-Time Market Data
 * Provides streaming orderbook updates
 */

import crypto from "crypto";

const WS_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
const EVENT_TICKER = "KXSNOWSTORM-26JANNYC";

interface OrderbookUpdate {
  ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  timestamp: string;
}

interface WebSocketMessage {
  type: string;
  msg?: {
    market_ticker?: string;
    price?: number;
    side?: string;
    delta?: number;
    yes?: number;
    no?: number;
  };
}

/**
 * Generate WebSocket authentication headers
 */
export function generateWsAuthHeaders(): Record<string, string> | null {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKeyId || !privateKeyPem) {
    console.error("[Kalshi WS] Missing API credentials");
    return null;
  }

  const timestamp = Date.now().toString();
  const method = "GET";
  const path = "/trade-api/ws/v2";
  const message = timestamp + method + path;

  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign("sha256", Buffer.from(message), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    return {
      "KALSHI-ACCESS-KEY": apiKeyId,
      "KALSHI-ACCESS-SIGNATURE": signature.toString("base64"),
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
    };
  } catch (error) {
    console.error("[Kalshi WS] Failed to generate auth headers:", error);
    return null;
  }
}

/**
 * Get snow market tickers
 */
export function getSnowMarketTickers(): string[] {
  return [
    `${EVENT_TICKER}-2.0`,
    `${EVENT_TICKER}-4.0`,
    `${EVENT_TICKER}-6.0`,
    `${EVENT_TICKER}-8.0`,
    `${EVENT_TICKER}-10.0`,
    `${EVENT_TICKER}-12.0`,
    `${EVENT_TICKER}-15.0`,
    `${EVENT_TICKER}-18.0`,
    `${EVENT_TICKER}-20.0`,
    `${EVENT_TICKER}-24.0`,
  ];
}

/**
 * Create subscription message for orderbook updates
 */
export function createSubscribeMessage(tickers: string[]): string {
  return JSON.stringify({
    id: 1,
    cmd: "subscribe",
    params: {
      channels: ["orderbook_delta"],
      market_tickers: tickers,
    },
  });
}

/**
 * Parse orderbook message
 */
export function parseOrderbookMessage(data: string): OrderbookUpdate | null {
  try {
    const msg = JSON.parse(data);

    if (msg.type === "orderbook_snapshot" || msg.type === "orderbook_delta") {
      return {
        ticker: msg.msg?.market_ticker || "",
        yes_bid: msg.msg?.yes_bid || 0,
        yes_ask: msg.msg?.yes_ask || 0,
        no_bid: msg.msg?.no_bid || 0,
        no_ask: msg.msg?.no_ask || 0,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export { WS_URL, EVENT_TICKER };
export type { OrderbookUpdate, WebSocketMessage };
