/**
 * Polymarket Profile & Orderbook Fetcher
 * Fetches user positions and orderbook data
 */

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";

interface PolymarketPosition {
  market_id: string;
  market_slug: string;
  market_question: string;
  outcome: "Yes" | "No";
  size: number;
  average_price: number;
  current_price: number;
  unrealized_pnl: number;
  realized_pnl: number;
}

interface PolymarketOrderbook {
  market_id: string;
  market_question: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  spread: number;
  midpoint: number;
}

interface PolymarketMarketDetails {
  id: string;
  question: string;
  slug: string;
  end_date: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  groupItemTitle?: string;
  clobTokenIds?: string[];
}

/**
 * Fetch user profile and positions from Polymarket
 * Note: Polymarket doesn't have a public API for positions,
 * so we scrape the profile page or use the activity endpoint
 */
export async function getPolymarketPositions(
  username: string
): Promise<PolymarketPosition[]> {
  try {
    // Try to fetch from the profile API endpoint
    // This is an undocumented endpoint that may or may not work
    const url = `${GAMMA_API_BASE}/profiles/${username}/positions`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();
      return (data.positions || []).map((pos: any) => ({
        market_id: pos.market_id || pos.marketId,
        market_slug: pos.market_slug || pos.slug || "",
        market_question: pos.market_question || pos.question || "",
        outcome: pos.outcome || "Yes",
        size: parseFloat(pos.size || pos.shares || "0"),
        average_price: parseFloat(pos.average_price || pos.avgPrice || "0"),
        current_price: parseFloat(pos.current_price || pos.currentPrice || "0"),
        unrealized_pnl: parseFloat(pos.unrealized_pnl || pos.pnl || "0"),
        realized_pnl: parseFloat(pos.realized_pnl || "0"),
      }));
    }

    // Fallback: try the activity endpoint
    const activityUrl = `${GAMMA_API_BASE}/activity?user=${username}&limit=100`;
    const activityResponse = await fetch(activityUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (activityResponse.ok) {
      const activityData = await activityResponse.json();
      // Aggregate activity into positions (simplified)
      const positionMap = new Map<string, PolymarketPosition>();

      for (const activity of activityData.activities || []) {
        if (activity.type === "trade") {
          const key = `${activity.market_id}-${activity.outcome}`;
          const existing = positionMap.get(key);

          if (existing) {
            existing.size += parseFloat(activity.size || "0");
          } else {
            positionMap.set(key, {
              market_id: activity.market_id,
              market_slug: activity.market_slug || "",
              market_question: activity.market_question || "",
              outcome: activity.outcome,
              size: parseFloat(activity.size || "0"),
              average_price: parseFloat(activity.price || "0"),
              current_price: 0,
              unrealized_pnl: 0,
              realized_pnl: 0,
            });
          }
        }
      }

      return Array.from(positionMap.values()).filter((p) => p.size !== 0);
    }

    console.log("[Polymarket] Could not fetch positions for user:", username);
    return [];
  } catch (error) {
    console.error("[Polymarket] Failed to fetch positions:", error);
    return [];
  }
}

/**
 * Get orderbook for a market from CLOB
 */
export async function getPolymarketOrderbook(
  tokenId: string,
  marketQuestion?: string
): Promise<PolymarketOrderbook | null> {
  try {
    const url = `${CLOB_API_BASE}/book?token_id=${tokenId}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const bids = (data.bids || []).map((b: any) => ({
      price: parseFloat(b.price),
      size: parseFloat(b.size),
    }));

    const asks = (data.asks || []).map((a: any) => ({
      price: parseFloat(a.price),
      size: parseFloat(a.size),
    }));

    const bestBid = bids.length > 0 ? Math.max(...bids.map((b: any) => b.price)) : 0;
    const bestAsk = asks.length > 0 ? Math.min(...asks.map((a: any) => a.price)) : 1;

    return {
      market_id: tokenId,
      market_question: marketQuestion || "",
      bids,
      asks,
      spread: bestAsk - bestBid,
      midpoint: (bestBid + bestAsk) / 2,
    };
  } catch (error) {
    console.error(`[Polymarket] Failed to fetch orderbook for ${tokenId}:`, error);
    return null;
  }
}

/**
 * Get NYC snowfall markets with details and orderbooks
 */
export async function getNYCSnowfallMarketsWithDetails(): Promise<{
  markets: PolymarketMarketDetails[];
  positions: PolymarketPosition[];
  orderbooks: Record<string, PolymarketOrderbook>;
  eventTitle: string;
  eventEndDate: string;
}> {
  const EVENT_SLUG = "how-many-inches-of-snow-in-nyc-this-weekend-jan-24-26";
  const username = process.env.POLYMARKET_PROFILE_USERNAME || "";

  try {
    // Fetch the event and its markets
    const eventUrl = `${GAMMA_API_BASE}/events?slug=${encodeURIComponent(EVENT_SLUG)}`;
    const eventResponse = await fetch(eventUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!eventResponse.ok) {
      throw new Error(`Failed to fetch event: ${eventResponse.status}`);
    }

    const events = await eventResponse.json();
    const event = events[0];

    if (!event) {
      throw new Error("Event not found");
    }

    const markets: PolymarketMarketDetails[] = event.markets || [];
    const eventTitle = event.title || "NYC Snowfall Jan 24-26";
    const eventEndDate = event.endDate || event.end_date || "";

    // Fetch positions for the user
    const allPositions = username ? await getPolymarketPositions(username) : [];

    // Filter positions for this event's markets
    const marketIds = new Set(markets.map((m) => m.id));
    const positions = allPositions.filter((p) => marketIds.has(p.market_id));

    // Fetch orderbooks for markets with CLOB token IDs
    const orderbooks: Record<string, PolymarketOrderbook> = {};
    for (const market of markets.slice(0, 10)) {
      // Limit to 10
      if (market.clobTokenIds && market.clobTokenIds.length > 0) {
        const tokenId = market.clobTokenIds[0];
        const orderbook = await getPolymarketOrderbook(tokenId, market.question);
        if (orderbook) {
          orderbooks[market.id] = orderbook;
        }
      }
    }

    return {
      markets,
      positions,
      orderbooks,
      eventTitle,
      eventEndDate,
    };
  } catch (error) {
    console.error("[Polymarket] Failed to fetch NYC snowfall data:", error);
    return {
      markets: [],
      positions: [],
      orderbooks: {},
      eventTitle: "NYC Snowfall Jan 24-26",
      eventEndDate: "",
    };
  }
}

export type { PolymarketPosition, PolymarketOrderbook, PolymarketMarketDetails };
