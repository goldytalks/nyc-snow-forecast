/**
 * Polymarket API Client
 * Fetches market data for NYC snowfall markets
 * Docs: https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide
 */

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  markets: PolymarketMarket[];
  active: boolean;
  closed: boolean;
  archived: boolean;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  clobTokenIds?: string[];
  // Additional price fields that might be present
  bestBid?: string;
  bestAsk?: string;
  lastTradePrice?: string;
  price?: string;
  groupItemTitle?: string;
}

export interface CLOBPrice {
  token_id: string;
  bid: number;
  ask: number;
  last_trade_price: number;
}

export interface ParsedPolymarketMarket {
  id: string;
  question: string;
  slug: string;
  rangeType: "under" | "range" | "over";
  rangeLow: number | null;
  rangeHigh: number | null;
  yesPrice: number;
  noPrice: number;
  volume: number;
  impliedProbability: number;
}

/**
 * Search for events by query
 */
export async function searchPolymarketEvents(
  query: string
): Promise<PolymarketEvent[]> {
  const url = new URL(`${GAMMA_API_BASE}/events`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const events: PolymarketEvent[] = await response.json();

  // Filter for snow-related events
  const snowEvents = events.filter(
    (e) =>
      e.title.toLowerCase().includes("snow") ||
      e.title.toLowerCase().includes("nyc") ||
      e.title.toLowerCase().includes("new york") ||
      e.description?.toLowerCase().includes("snowfall")
  );

  return snowEvents;
}

/**
 * Get event by slug
 */
export async function getPolymarketEventBySlug(
  slug: string
): Promise<PolymarketEvent | null> {
  const url = `${GAMMA_API_BASE}/events?slug=${encodeURIComponent(slug)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    return null;
  }

  const events: PolymarketEvent[] = await response.json();
  return events[0] || null;
}

/**
 * Get markets for an event
 */
export async function getPolymarketMarkets(
  eventId?: string
): Promise<PolymarketMarket[]> {
  const url = new URL(`${GAMMA_API_BASE}/markets`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const markets: PolymarketMarket[] = await response.json();

  // Filter for snow-related markets
  return markets.filter(
    (m) =>
      m.question.toLowerCase().includes("snow") ||
      m.question.toLowerCase().includes("nyc") ||
      m.question.toLowerCase().includes("inches")
  );
}

/**
 * Get CLOB prices for token IDs
 */
export async function getCLOBPrices(tokenIds: string[]): Promise<CLOBPrice[]> {
  const prices: CLOBPrice[] = [];

  for (const tokenId of tokenIds) {
    try {
      const url = `${CLOB_API_BASE}/price?token_id=${tokenId}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        next: { revalidate: 30 },
      });

      if (response.ok) {
        const data = await response.json();
        prices.push({
          token_id: tokenId,
          bid: parseFloat(data.bid || "0"),
          ask: parseFloat(data.ask || "0"),
          last_trade_price: parseFloat(data.last_trade_price || "0"),
        });
      }
    } catch {
      // Continue to next token
    }
  }

  return prices;
}

/**
 * Fetch NYC snowfall markets from Polymarket
 * Specific event: https://polymarket.com/event/how-many-inches-of-snow-in-nyc-this-weekend-february-21-23
 */
export async function fetchNYCSnowfallMarkets(): Promise<ParsedPolymarketMarket[]> {
  // The exact slug for NYC Feb 21-23 snowfall
  const EVENT_SLUG = "how-many-inches-of-snow-in-nyc-this-weekend-february-21-23-273";

  let allMarkets: PolymarketMarket[] = [];

  // First try the exact slug
  try {
    const event = await getPolymarketEventBySlug(EVENT_SLUG);
    if (event && event.markets) {
      allMarkets = event.markets;
      console.log(`[Polymarket] Found ${event.markets.length} markets for ${EVENT_SLUG}`);
    }
  } catch (error) {
    console.error(`[Polymarket] Failed to fetch ${EVENT_SLUG}:`, error);
  }

  // If no markets found, try alternative slugs
  if (allMarkets.length === 0) {
    const fallbackSlugs = [
      "how-many-inches-of-snow-in-nyc-this-weekend-february-21-23",
      "nyc-snowfall-february-2026",
      "new-york-city-snowfall",
    ];

    for (const slug of fallbackSlugs) {
      try {
        const event = await getPolymarketEventBySlug(slug);
        if (event && event.markets) {
          allMarkets = [...allMarkets, ...event.markets];
          console.log(`[Polymarket] Found ${event.markets.length} markets for ${slug}`);
        }
      } catch {
        // Continue
      }
    }
  }

  // If still nothing, try a general search
  if (allMarkets.length === 0) {
    try {
      const markets = await getPolymarketMarkets();
      allMarkets = markets;
    } catch {
      // Ignore
    }
  }

  // Deduplicate
  const uniqueMarkets = Array.from(
    new Map(allMarkets.map((m) => [m.id, m])).values()
  );

  // Try to fetch CLOB prices for markets with token IDs
  const marketsWithPrices = await enrichWithCLOBPrices(uniqueMarkets);

  // Parse markets
  return marketsWithPrices
    .map(parsePolymarketMarket)
    .filter((m) => m !== null) as ParsedPolymarketMarket[];
}

/**
 * Enrich markets with CLOB prices
 */
async function enrichWithCLOBPrices(markets: PolymarketMarket[]): Promise<PolymarketMarket[]> {
  const enrichedMarkets: PolymarketMarket[] = [];

  for (const market of markets) {
    const tokenIds = market.clobTokenIds ? (typeof market.clobTokenIds === "string" ? JSON.parse(market.clobTokenIds) : market.clobTokenIds) as string[] : [];
    if (tokenIds.length > 0) {
      try {
        const prices = await getCLOBPrices(tokenIds.slice(0, 1));
        if (prices.length > 0) {
          const price = prices[0];
          market.bestBid = price.bid.toString();
          market.lastTradePrice = price.last_trade_price.toString();
        }
      } catch {
        // Continue without CLOB prices
      }
    }
    enrichedMarkets.push(market);
  }

  return enrichedMarkets;
}

/**
 * Parse a Polymarket market into standardized format
 */
function parsePolymarketMarket(
  market: PolymarketMarket
): ParsedPolymarketMarket | null {
  const question = market.question.toLowerCase();

  // Parse range from question
  // "<4", "4-6", "6-8", "8-10", "10-12", "12-14", "14+"
  let rangeType: "under" | "range" | "over" = "range";
  let rangeLow: number | null = null;
  let rangeHigh: number | null = null;

  // Match patterns like "<4", "under 4", "less than 4"
  const underMatch = question.match(/(?:<|under|less than)\s*(\d+)/i);
  if (underMatch) {
    rangeType = "under";
    rangeHigh = parseFloat(underMatch[1]);
  }

  // Match patterns like "14 or more", "14+", "over 14", "more than 14", "above 14"
  const overMatch = question.match(/(\d+)\s*(?:or more|\+)|(?:over|more than|above)\s*(\d+)/i);
  if (overMatch) {
    rangeType = "over";
    rangeLow = parseFloat(overMatch[1] || overMatch[2]);
  }

  // Match range patterns like "4-6", "4 to 6"
  const rangeMatch = question.match(/(\d+)\s*[-–to]\s*(\d+)/i);
  if (rangeMatch) {
    rangeType = "range";
    rangeLow = parseFloat(rangeMatch[1]);
    rangeHigh = parseFloat(rangeMatch[2]);
  }

  // Parse prices - try multiple possible fields
  // Polymarket API returns prices as strings in outcomePrices array
  // or as bestBid/bestAsk fields, or as price field
  const prices = market.outcomePrices || [];
  let yesPrice = parseFloat(prices[0] || "0");

  // If outcomePrices didn't work, try other fields
  if (yesPrice === 0 || isNaN(yesPrice)) {
    // Try market.bestBid or other price fields that might exist
    const anyMarket = market as any;
    if (anyMarket.bestBid) {
      yesPrice = parseFloat(anyMarket.bestBid);
    } else if (anyMarket.price) {
      yesPrice = parseFloat(anyMarket.price);
    } else if (anyMarket.lastTradePrice) {
      yesPrice = parseFloat(anyMarket.lastTradePrice);
    }
  }

  const noPrice = parseFloat(prices[1] || "0") || 1 - yesPrice;

  return {
    id: market.id,
    question: market.question,
    slug: market.slug,
    rangeType,
    rangeLow,
    rangeHigh,
    yesPrice,
    noPrice,
    volume: parseFloat(market.volume || "0"),
    impliedProbability: yesPrice,
  };
}

/**
 * Format Polymarket markets for edge comparison
 */
export function formatPolymarketForComparison(
  markets: ParsedPolymarketMarket[]
): Array<{
  range: string;
  rangeType: "under" | "range" | "over";
  rangeLow: number | null;
  rangeHigh: number | null;
  marketYes: number;
  volume: number;
  source: "polymarket";
}> {
  return markets.map((m) => {
    let range: string;
    if (m.rangeType === "under") {
      range = `<${m.rangeHigh}"`;
    } else if (m.rangeType === "over") {
      range = `${m.rangeLow}+"`;
    } else {
      range = `${m.rangeLow}-${m.rangeHigh}"`;
    }

    return {
      range,
      rangeType: m.rangeType,
      rangeLow: m.rangeLow,
      rangeHigh: m.rangeHigh,
      marketYes: m.yesPrice,
      volume: m.volume,
      source: "polymarket" as const,
    };
  });
}
