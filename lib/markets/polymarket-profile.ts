/**
 * Polymarket Profile & Orderbook Fetcher
 * Fetches user positions via Data API and orderbook data via CLOB API
 */

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

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
 * Fetch user positions from Polymarket Data API
 * Uses wallet address — no authentication required for read access
 */
export async function getPolymarketPositions(): Promise<PolymarketPosition[]> {
  const walletAddress = process.env.POLYMARKET_WALLET_ADDRESS;
  if (!walletAddress) {
    console.log("[Polymarket] No POLYMARKET_WALLET_ADDRESS configured");
    return [];
  }

  try {
    const url = `${DATA_API_BASE}/positions?user=${walletAddress.toLowerCase()}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[Polymarket] Data API positions returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const positions = Array.isArray(data) ? data : [];

    return positions
      .filter((pos: any) => parseFloat(pos.size || "0") !== 0)
      .map((pos: any) => ({
        market_id: pos.asset || pos.conditionId || "",
        market_slug: pos.market?.slug || pos.slug || "",
        market_question: pos.market?.question || pos.title || "",
        outcome: pos.outcome === "Yes" || pos.outcome === "No" ? pos.outcome : "Yes",
        size: parseFloat(pos.size || "0"),
        average_price: parseFloat(pos.avgPrice || pos.average_price || "0"),
        current_price: parseFloat(pos.curPrice || pos.current_price || "0"),
        unrealized_pnl: parseFloat(pos.cashPnl || pos.pnl || "0"),
        realized_pnl: parseFloat(pos.realizedPnl || pos.realized_pnl || "0"),
      }));
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
  const EVENT_SLUG = "how-many-inches-of-snow-in-nyc-this-weekend-february-21-23";

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
    const eventTitle = event.title || "NYC Snowfall Feb 21-23";
    const eventEndDate = event.endDate || event.end_date || "";

    // Fetch positions using wallet address (no auth required)
    const allPositions = await getPolymarketPositions();

    // Filter positions for this event's markets
    const marketTokenIds = new Set<string>();
    for (const m of markets) {
      if (m.clobTokenIds) {
        m.clobTokenIds.forEach((t) => marketTokenIds.add(t));
      }
    }
    // Match positions by token_id (asset field) against market token IDs
    const positions = allPositions.filter(
      (p) => marketTokenIds.has(p.market_id) || markets.some((m) => m.id === p.market_id)
    );

    // Fetch orderbooks for markets with CLOB token IDs
    const orderbooks: Record<string, PolymarketOrderbook> = {};
    for (const market of markets.slice(0, 10)) {
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
      eventTitle: "NYC Snowfall Feb 21-23",
      eventEndDate: "",
    };
  }
}

export type { PolymarketPosition, PolymarketOrderbook, PolymarketMarketDetails };
