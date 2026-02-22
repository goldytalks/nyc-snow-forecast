/**
 * Authenticated Kalshi API Client
 * Uses RSA key signing for authenticated endpoints
 * Docs: https://docs.kalshi.com/getting_started/api_keys
 */

import crypto from "crypto";

const KALSHI_API_BASES = [
  "https://api.elections.kalshi.com/trade-api/v2",
  "https://demo-api.kalshi.co/trade-api/v2",
];

let resolvedBaseUrl: string | null = null;

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
  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split("?")[0];

  // Message format: timestamp_ms + HTTP_METHOD + path_without_query
  const message = timestamp + method.toUpperCase() + pathWithoutQuery;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  sign.end();
  const signature = sign.sign({
    key: privateKeyPem,
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
 * Probe Kalshi API bases to find which one accepts our key
 */
async function resolveApiBase(): Promise<string> {
  if (resolvedBaseUrl) return resolvedBaseUrl;

  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKeyId || !privateKey) {
    return KALSHI_API_BASES[0];
  }

  for (const base of KALSHI_API_BASES) {
    try {
      const path = "/trade-api/v2/portfolio/balance";
      const headers = generateAuthHeaders("GET", path, apiKeyId, privateKey);
      const resp = await fetch(`${base}/portfolio/balance`, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      if (resp.status === 200) {
        console.log(`[Kalshi] Auth works on ${base}`);
        resolvedBaseUrl = base;
        return base;
      }

      const body = await resp.text();
      // NOT_FOUND means key doesn't exist on this domain, try next
      if (body.includes("NOT_FOUND")) {
        console.log(`[Kalshi] Key not found on ${base}, trying next...`);
        continue;
      }

      // Any other error (signature mismatch, etc.) means key exists here but signing is wrong
      console.log(`[Kalshi] Got ${resp.status} from ${base}: ${body.substring(0, 100)}`);
      resolvedBaseUrl = base;
      return base;
    } catch {
      continue;
    }
  }

  // Default to production
  resolvedBaseUrl = KALSHI_API_BASES[0];
  return KALSHI_API_BASES[0];
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

  const base = await resolveApiBase();
  const fullPath = `/trade-api/v2${path.split("?")[0]}`;
  const headers = generateAuthHeaders("GET", fullPath, apiKeyId, privateKey);
  const url = `${base}${path}`;

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
      return {
        positions: [],
        authStatus: { authenticated: false, error: "API credentials not configured" },
      };
    }

    const data = await authenticatedRequest<{ market_positions: any[] }>(
      "GET",
      "/portfolio/positions?count_filter=position"
    );

    const positions = (data.market_positions || [])
      .filter((pos: any) => pos.position !== 0)
      .map((pos: any) => {
        // Extract event_ticker from ticker (e.g., "KXSNOWSTORM-26FEBNYC2-10.0" -> "KXSNOWSTORM-26FEBNYC2")
        const tickerParts = pos.ticker.split("-");
        const eventTicker = tickerParts.length >= 2
          ? tickerParts.slice(0, -1).join("-")
          : pos.ticker;

        // Kalshi monetary values are in centi-cents (÷10000 for dollars)
        // Use _dollars fields when available for accuracy
        return {
          ticker: pos.ticker,
          event_ticker: eventTicker,
          market_title: pos.market_title || pos.ticker,
          position: pos.position,
          average_price: pos.market_exposure_dollars
            ? parseFloat(pos.market_exposure_dollars) / Math.abs(pos.position)
            : pos.market_exposure / Math.abs(pos.position) / 10000 || 0,
          realized_pnl: pos.realized_pnl_dollars
            ? parseFloat(pos.realized_pnl_dollars)
            : pos.realized_pnl / 10000 || 0,
          unrealized_pnl: 0, // Calculated later with current market price
          total_cost: pos.market_exposure_dollars
            ? parseFloat(pos.market_exposure_dollars)
            : pos.market_exposure / 10000 || 0,
        };
      });

    return {
      positions,
      authStatus: { authenticated: true },
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error("[Kalshi] Auth error:", errorMsg.substring(0, 200));

    let authError = "Authentication failed";
    if (errorMsg.includes("NOT_FOUND")) {
      authError = "API key not found — regenerate at kalshi.com/account/profile";
    } else if (errorMsg.includes("INCORRECT_API_KEY_SIGNATURE")) {
      authError = "API key signature mismatch — verify key pair matches";
    } else if (errorMsg.includes("INVALID_API_KEY")) {
      authError = "Invalid API key ID";
    } else if (errorMsg.includes("credentials not configured")) {
      authError = "API credentials not configured in .env.local";
    }

    return {
      positions: [],
      authStatus: { authenticated: false, error: authError },
    };
  }
}

/**
 * Get orderbook for a specific market (no auth required)
 * Kalshi orderbooks only contain BIDS — YES bid at X¢ = NO ask at (100-X)¢
 */
export async function getKalshiOrderbook(
  ticker: string
): Promise<KalshiOrderbook | null> {
  try {
    const url = `${KALSHI_API_BASES[0]}/markets/${ticker}/orderbook`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const orderbook = data.orderbook;

    // Kalshi orderbook format: { yes: [[price, qty], ...], no: [[price, qty], ...] }
    // These are BIDS only. Asks are derived from the opposite side.
    const yesBids = (orderbook.yes || []).map((entry: any) => {
      // Handle both array format [price, qty] and object format {price, quantity}
      if (Array.isArray(entry)) {
        return { price: entry[0], quantity: entry[1] };
      }
      return { price: entry.price, quantity: entry.quantity || entry.count };
    });

    const noBids = (orderbook.no || []).map((entry: any) => {
      if (Array.isArray(entry)) {
        return { price: entry[0], quantity: entry[1] };
      }
      return { price: entry.price, quantity: entry.quantity || entry.count };
    });

    // Derive implied asks from opposite side bids
    // YES ask = 100 - best NO bid price
    const yesAsks = noBids.map((nb: any) => ({
      price: 100 - nb.price,
      quantity: nb.quantity,
    }));

    const noAsks = yesBids.map((yb: any) => ({
      price: 100 - yb.price,
      quantity: yb.quantity,
    }));

    return {
      ticker,
      market_title: ticker,
      yes_bids: yesBids,
      yes_asks: yesAsks,
      no_bids: noBids,
      no_asks: noAsks,
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
    const url = `${KALSHI_API_BASES[0]}/markets/${ticker}`;
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
    // Fetch markets for the event (no auth required)
    const marketsUrl = `${KALSHI_API_BASES[0]}/markets?event_ticker=${EVENT_TICKER}&limit=100`;
    const marketsResponse = await fetch(marketsUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!marketsResponse.ok) {
      throw new Error(`Failed to fetch markets: ${marketsResponse.status}`);
    }

    const marketsData = await marketsResponse.json();
    const markets: KalshiMarketDetails[] = marketsData.markets || [];

    // Fetch positions with timeout so auth failures don't block the response
    let eventPositions: KalshiPosition[] = [];
    try {
      const positionsPromise = getKalshiPositionsWithStatus();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Kalshi auth timeout")), 8000)
      );
      const positionsResult = await Promise.race([positionsPromise, timeoutPromise]);
      authStatus = positionsResult.authStatus;
      eventPositions = positionsResult.positions.filter(
        (p) => p.ticker.startsWith(EVENT_TICKER) && p.position !== 0
      );
    } catch (err: any) {
      authStatus = { authenticated: false, error: err.message || "Auth timeout" };
    }

    // Fetch orderbooks for each market (no auth required)
    const orderbooks: Record<string, KalshiOrderbook> = {};
    for (const market of markets.slice(0, 10)) {
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
