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
 * Uses RSA-PSS signatures as per Kalshi documentation
 */
function generateAuthHeaders(
  method: string,
  path: string,
  apiKeyId: string,
  privateKeyPem: string
): Record<string, string> {
  // Timestamp in milliseconds
  const timestamp = Date.now().toString();

  // Strip query parameters from path for signing
  const pathWithoutQuery = path.split("?")[0];

  // IMPORTANT: The signature must include the full path from the base URL
  // e.g., "/trade-api/v2/portfolio/positions" not just "/portfolio/positions"
  const fullPath = `/trade-api/v2${pathWithoutQuery}`;

  // Message to sign: timestamp + method + full path (with base path prefix)
  const message = timestamp + method.toUpperCase() + fullPath;

  // Sign with RSA-PSS using SHA256
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
  const result = await getKalshiPositionsWithStatus();
  return result.positions;
}

/**
 * Get positions with authentication status
 */
export async function getKalshiPositionsWithStatus(): Promise<{
  positions: KalshiPosition[];
  authStatus: { authenticated: boolean; error?: string };
}> {
  try {
    const apiKeyId = process.env.KALSHI_API_KEY_ID;
    const privateKey = process.env.KALSHI_PRIVATE_KEY;

    if (!apiKeyId || !privateKey) {
      console.log("[Kalshi Auth] API credentials not configured");
      return {
        positions: [],
        authStatus: { authenticated: false, error: "API credentials not configured" },
      };
    }

    const data = await authenticatedRequest<{ market_positions: any[] }>(
      "GET",
      "/portfolio/positions"
    );

    console.log("[Kalshi Auth] Positions response:", JSON.stringify(data).substring(0, 200));

    const positions = (data.market_positions || [])
      .filter((pos: any) => pos.position !== 0) // Only include non-zero positions
      .map((pos: any) => {
        // Extract event_ticker from ticker (e.g., "KXSNOWSTORM-26FEBNYC2-10.0" -> "KXSNOWSTORM-26FEBNYC2")
        const tickerParts = pos.ticker.split("-");
        const eventTicker = tickerParts.length >= 2
          ? tickerParts.slice(0, -1).join("-")
          : pos.ticker;

        return {
          ticker: pos.ticker,
          event_ticker: eventTicker,
          market_title: pos.market_title || pos.ticker,
          position: pos.position,
          average_price: pos.market_exposure / Math.abs(pos.position) / 100 || 0,
          realized_pnl: pos.realized_pnl / 100 || 0,
          unrealized_pnl: (pos.total_traded - pos.market_exposure) / 100 || 0,
          total_cost: pos.market_exposure / 100 || 0,
        };
      });

    return {
      positions,
      authStatus: { authenticated: true },
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error("[Kalshi Auth] Failed to fetch positions:", errorMsg);

    // Check for specific auth errors
    let authError = "Authentication failed";
    if (errorMsg.includes("INCORRECT_API_KEY_SIGNATURE")) {
      authError = "API key signature mismatch - please verify your API key pair";
    } else if (errorMsg.includes("INVALID_API_KEY")) {
      authError = "Invalid API key ID";
    } else if (errorMsg.includes("401")) {
      authError = "Authentication failed - check API credentials";
    }

    return {
      positions: [],
      authStatus: { authenticated: false, error: authError },
    };
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
  authStatus: { authenticated: boolean; error?: string };
}> {
  const EVENT_TICKER = "KXSNOWSTORM-26FEBNYC2";
  let authStatus: { authenticated: boolean; error?: string } = { authenticated: false };

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

    // Fetch positions (authenticated) - returns result with auth status
    const positionsResult = await getKalshiPositionsWithStatus();
    authStatus = positionsResult.authStatus;

    // Filter positions for this event (by ticker prefix) and exclude zero positions
    const eventPositions = positionsResult.positions.filter(
      (p) => p.ticker.startsWith(EVENT_TICKER) && p.position !== 0
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
      authStatus,
    };
  } catch (error) {
    console.error("[Kalshi] Failed to fetch NYC snowstorm data:", error);
    return {
      markets: [],
      positions: [],
      orderbooks: {},
      authStatus: { authenticated: false, error: "Failed to fetch market data" },
    };
  }
}

export type { KalshiPosition, KalshiOrderbook, KalshiMarketDetails };
