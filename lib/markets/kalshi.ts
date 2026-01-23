/**
 * Kalshi API Client
 * Fetches market data for NYC snowfall markets
 * Docs: https://docs.kalshi.com/api-reference/market/get-markets
 */

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  status: string;
  result: string | null;
  strike_type: string;
  floor_strike?: number;
  cap_strike?: number;
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor: string;
}

export interface ParsedKalshiMarket {
  ticker: string;
  title: string;
  threshold: number;
  direction: "over" | "under";
  yesBid: number;
  yesAsk: number;
  yesMid: number;
  noBid: number;
  noAsk: number;
  volume: number;
  impliedProbability: number;
}

/**
 * Search for markets by event ticker or series
 */
export async function searchKalshiMarkets(
  query: string
): Promise<KalshiMarket[]> {
  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set("limit", "200");
  url.searchParams.set("status", "open");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data: KalshiMarketsResponse = await response.json();

  // Filter for snow-related markets
  const snowMarkets = data.markets.filter(
    (m) =>
      m.title.toLowerCase().includes("snow") ||
      m.title.toLowerCase().includes("nyc") ||
      m.event_ticker.toLowerCase().includes("snow") ||
      m.ticker.toLowerCase().includes("snow")
  );

  return snowMarkets;
}

/**
 * Get markets by event ticker
 */
export async function getKalshiMarketsByEvent(
  eventTicker: string
): Promise<KalshiMarket[]> {
  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set("event_ticker", eventTicker);
  url.searchParams.set("limit", "100");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data: KalshiMarketsResponse = await response.json();
  return data.markets;
}

/**
 * Get a specific market by ticker
 */
export async function getKalshiMarket(ticker: string): Promise<KalshiMarket> {
  const url = `${KALSHI_API_BASE}/markets/${ticker}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data = await response.json();
  return data.market;
}

/**
 * Fetch all NYC snowfall markets
 * Common event tickers: KXSNOWNYC, SNOWNYC, etc.
 */
export async function fetchNYCSnowfallMarkets(): Promise<ParsedKalshiMarket[]> {
  // Try different possible event tickers
  const possibleTickers = [
    "KXSNOWNYC",
    "SNOWNYC",
    "NYCSNOW",
    "KXNYCSNOW",
    "SNOW-NYC",
    "SNOW-26-NYC",
    "KXSNOW",
  ];

  let allMarkets: KalshiMarket[] = [];

  // Try each possible ticker
  for (const ticker of possibleTickers) {
    try {
      const markets = await getKalshiMarketsByEvent(ticker);
      if (markets.length > 0) {
        allMarkets = [...allMarkets, ...markets];
      }
    } catch {
      // Continue to next ticker
    }
  }

  // Also do a general search
  try {
    const searchResults = await searchKalshiMarkets("snow");
    allMarkets = [...allMarkets, ...searchResults];
  } catch {
    // Ignore search errors
  }

  // Deduplicate by ticker
  const uniqueMarkets = Array.from(
    new Map(allMarkets.map((m) => [m.ticker, m])).values()
  );

  // Parse and return
  return uniqueMarkets.map(parseKalshiMarket).filter((m) => m !== null) as ParsedKalshiMarket[];
}

/**
 * Parse a Kalshi market into a standardized format
 */
function parseKalshiMarket(market: KalshiMarket): ParsedKalshiMarket | null {
  // Extract threshold from title (e.g., "Above 8.0 inches")
  const thresholdMatch = market.title.match(
    /(?:above|over|below|under)\s*(\d+(?:\.\d+)?)\s*inch/i
  );

  if (!thresholdMatch) {
    // Try to extract from floor/cap strike
    if (market.floor_strike !== undefined) {
      return {
        ticker: market.ticker,
        title: market.title,
        threshold: market.floor_strike,
        direction: "over",
        yesBid: market.yes_bid / 100,
        yesAsk: market.yes_ask / 100,
        yesMid: (market.yes_bid + market.yes_ask) / 200,
        noBid: market.no_bid / 100,
        noAsk: market.no_ask / 100,
        volume: market.volume,
        impliedProbability: (market.yes_bid + market.yes_ask) / 200,
      };
    }
    return null;
  }

  const threshold = parseFloat(thresholdMatch[1]);
  const direction = market.title.toLowerCase().includes("above") ||
    market.title.toLowerCase().includes("over")
    ? "over"
    : "under";

  // Kalshi prices are in cents (0-100)
  const yesBid = market.yes_bid / 100;
  const yesAsk = market.yes_ask / 100;
  const yesMid = (yesBid + yesAsk) / 2;

  return {
    ticker: market.ticker,
    title: market.title,
    threshold,
    direction,
    yesBid,
    yesAsk,
    yesMid,
    noBid: market.no_bid / 100,
    noAsk: market.no_ask / 100,
    volume: market.volume,
    impliedProbability: yesMid,
  };
}

/**
 * Format Kalshi markets for edge comparison
 */
export function formatKalshiForComparison(
  markets: ParsedKalshiMarket[]
): Array<{
  threshold: number;
  marketYes: number;
  marketNo: number;
  volume: number;
  source: "kalshi";
}> {
  return markets
    .filter((m) => m.direction === "over")
    .sort((a, b) => a.threshold - b.threshold)
    .map((m) => ({
      threshold: m.threshold,
      marketYes: m.yesMid,
      marketNo: 1 - m.yesMid,
      volume: m.volume,
      source: "kalshi" as const,
    }));
}
