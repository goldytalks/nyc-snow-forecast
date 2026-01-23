/**
 * Authenticated Kalshi API Client
 * Uses RSA key signing for authenticated endpoints
 * Docs: https://docs.kalshi.com/api-reference/authentication
 */

import crypto from "crypto";

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiPosition {
  ticker: string;
  event_ticker: string;
  market_title: string;
  position: number; // positive = yes, negative = no
  average_price: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_cost: number;
}

interface KalshiOrderbook {
  ticker: string;
  market_title: string;
  yes_bids: Array<{ price: number; quantity: number }>;
  yes_asks: Array<{ price: number; quantity: number }>;
  no_bids: Array<{ price: number; quantity: number }>;
  no_asks: Array<{ price: number; quantity: number }>;
}

interface KalshiMarketDetails {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  close_time: string;
  expiration_time: string;
  settlement_timer_seconds: number;
  status: string;
  result: string | null;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
}

/**
 * Generate authentication headers for Kalshi API
 */
function generateAuthHeaders(
  method: string,
  path: string,
  apiKeyId: string,
  privateKeyPem: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Message to sign: timestamp + method + path
  const message = timestamp + method.toUpperCase() + path;

  // Sign with RSA-SHA256
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  sign.end();

  const signature = sign.sign(privateKeyPem, "base64");

  return {
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Make authenticated request to Kalshi API
 */
async function authenticatedRequest<T>(
  method: string,
  path: string,
  body?: object
): Promise<T> {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKeyId || !privateKey) {
    throw new Error("Kalshi API credentials not configured");
  }

  const headers = generateAuthHeaders(method, path, apiKeyId, privateKey);
  const url = `${KALSHI_API_BASE}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kalshi API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Get user's portfolio/positions
 */
export async function getKalshiPositions(): Promise<KalshiPosition[]> {
  try {
    const data = await authenticatedRequest<{ market_positions: any[] }>(
      "GET",
      "/portfolio/positions"
    );

    return (data.market_positions || []).map((pos: any) => ({
      ticker: pos.ticker,
      event_ticker: pos.event_ticker,
      market_title: pos.market_title || pos.ticker,
      position: pos.position,
      average_price: pos.market_exposure / Math.abs(pos.position) / 100 || 0,
      realized_pnl: pos.realized_pnl / 100 || 0,
      unrealized_pnl: (pos.total_traded - pos.market_exposure) / 100 || 0,
      total_cost: pos.market_exposure / 100 || 0,
    }));
  } catch (error) {
    console.error("[Kalshi Auth] Failed to fetch positions:", error);
    return [];
  }
}

/**
 * Get orderbook for a specific market
 */
export async function getKalshiOrderbook(
  ticker: string
): Promise<KalshiOrderbook | null> {
  try {
    // Orderbook endpoint doesn't require auth
    const url = `${KALSHI_API_BASE}/markets/${ticker}/orderbook`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const orderbook = data.orderbook;

    return {
      ticker,
      market_title: ticker,
      yes_bids: (orderbook.yes || [])
        .filter((o: any) => o.side === "bid")
        .map((o: any) => ({ price: o.price, quantity: o.quantity })),
      yes_asks: (orderbook.yes || [])
        .filter((o: any) => o.side === "ask")
        .map((o: any) => ({ price: o.price, quantity: o.quantity })),
      no_bids: (orderbook.no || [])
        .filter((o: any) => o.side === "bid")
        .map((o: any) => ({ price: o.price, quantity: o.quantity })),
      no_asks: (orderbook.no || [])
        .filter((o: any) => o.side === "ask")
        .map((o: any) => ({ price: o.price, quantity: o.quantity })),
    };
  } catch (error) {
    console.error(`[Kalshi] Failed to fetch orderbook for ${ticker}:`, error);
    return null;
  }
}

/**
 * Get market details including close time
 */
export async function getKalshiMarketDetails(
  ticker: string
): Promise<KalshiMarketDetails | null> {
  try {
    const url = `${KALSHI_API_BASE}/markets/${ticker}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.market;
  } catch (error) {
    console.error(`[Kalshi] Failed to fetch market details for ${ticker}:`, error);
    return null;
  }
}

/**
 * Get all markets for the NYC snowstorm event with details
 */
export async function getNYCSnowstormMarketsWithDetails(): Promise<{
  markets: KalshiMarketDetails[];
  positions: KalshiPosition[];
  orderbooks: Record<string, KalshiOrderbook>;
}> {
  const EVENT_TICKER = "KXSNOWSTORM-26JANNYC";

  try {
    // Fetch markets for the event
    const marketsUrl = `${KALSHI_API_BASE}/markets?event_ticker=${EVENT_TICKER}&limit=100`;
    const marketsResponse = await fetch(marketsUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!marketsResponse.ok) {
      throw new Error(`Failed to fetch markets: ${marketsResponse.status}`);
    }

    const marketsData = await marketsResponse.json();
    const markets: KalshiMarketDetails[] = marketsData.markets || [];

    // Fetch positions (authenticated)
    const positions = await getKalshiPositions();

    // Filter positions for this event
    const eventPositions = positions.filter(
      (p) => p.event_ticker === EVENT_TICKER
    );

    // Fetch orderbooks for each market
    const orderbooks: Record<string, KalshiOrderbook> = {};
    for (const market of markets.slice(0, 10)) {
      // Limit to 10 markets
      const orderbook = await getKalshiOrderbook(market.ticker);
      if (orderbook) {
        orderbook.market_title = market.title;
        orderbooks[market.ticker] = orderbook;
      }
    }

    return {
      markets,
      positions: eventPositions,
      orderbooks,
    };
  } catch (error) {
    console.error("[Kalshi] Failed to fetch NYC snowstorm data:", error);
    return {
      markets: [],
      positions: [],
      orderbooks: {},
    };
  }
}

export type { KalshiPosition, KalshiOrderbook, KalshiMarketDetails };
