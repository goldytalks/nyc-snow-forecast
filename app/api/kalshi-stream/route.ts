/**
 * Real-Time Market Price Stream (SSE)
 * Streams Kalshi and Polymarket updates to clients every 2 seconds
 */

import { NextRequest } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Kalshi API
const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const EVENT_TICKER = "KXSNOWSTORM-26JANNYC";

// Polymarket APIs
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";
const POLYMARKET_EVENT_SLUG = "how-many-inches-of-snow-in-nyc-this-weekend-jan-24-26";

interface KalshiPrice {
  ticker: string;
  threshold: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume_24h: number;
}

interface PolymarketPrice {
  id: string;
  question: string;
  range: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
}

interface PolymarketPosition {
  conditionId: string;
  outcomeIndex: number;
  size: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  range: string;
  isYes: boolean;
}

/**
 * Generate auth headers for Kalshi API
 */
function generateAuthHeaders(
  method: string,
  path: string
): Record<string, string> | null {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKeyId || !privateKeyPem) {
    return null;
  }

  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split("?")[0];
  const fullPath = `/trade-api/v2${pathWithoutQuery}`;
  const message = timestamp + method.toUpperCase() + fullPath;

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
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  } catch (error) {
    console.error("[Kalshi] Failed to generate auth:", error);
    return null;
  }
}

/**
 * Fetch Kalshi market prices
 */
async function fetchKalshiPrices(): Promise<KalshiPrice[]> {
  try {
    const url = `${KALSHI_API_BASE}/markets?event_ticker=${EVENT_TICKER}&limit=20`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const markets = data.markets || [];

    return markets
      .map((m: any) => {
        const thresholdMatch = m.ticker.match(/-(\d+(?:\.\d+)?)$/);
        const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0;

        return {
          ticker: m.ticker,
          threshold,
          yes_bid: m.yes_bid,
          yes_ask: m.yes_ask,
          no_bid: m.no_bid,
          no_ask: m.no_ask,
          last_price: m.last_price,
          volume_24h: m.volume_24h,
        };
      })
      .sort((a: KalshiPrice, b: KalshiPrice) => a.threshold - b.threshold);
  } catch (error) {
    console.error("[Kalshi] Failed to fetch prices:", error);
    return [];
  }
}

/**
 * Fetch Polymarket prices from CLOB
 */
async function fetchPolymarketPrices(): Promise<PolymarketPrice[]> {
  try {
    // First get the event and its markets
    const eventUrl = `${GAMMA_API_BASE}/events?slug=${encodeURIComponent(POLYMARKET_EVENT_SLUG)}`;
    const eventResponse = await fetch(eventUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!eventResponse.ok) {
      throw new Error(`Event API error: ${eventResponse.status}`);
    }

    const events = await eventResponse.json();
    const event = events[0];

    if (!event || !event.markets) {
      return [];
    }

    const prices: PolymarketPrice[] = [];

    for (const market of event.markets) {
      // Extract range from question
      let range = market.groupItemTitle || "";
      if (!range) {
        const question = market.question.toLowerCase();
        if (question.includes("less than") || question.includes("<")) {
          const match = question.match(/(?:less than|<)\s*(\d+)/);
          range = match ? `<${match[1]}` : "";
        } else if (question.includes("or more") || question.includes("+")) {
          const match = question.match(/(\d+)\s*(?:or more|\+)/);
          range = match ? `${match[1]}+` : "";
        } else {
          const rangeMatch = question.match(/(\d+)[-–](\d+)/);
          range = rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : "";
        }
      }

      // Get live price from CLOB if token IDs available
      let yesPrice = parseFloat(market.outcomePrices?.[0] || "0");
      let noPrice = parseFloat(market.outcomePrices?.[1] || "0") || 1 - yesPrice;

      if (market.clobTokenIds && market.clobTokenIds.length > 0) {
        try {
          const clobUrl = `${CLOB_API_BASE}/price?token_id=${market.clobTokenIds[0]}`;
          const clobResponse = await fetch(clobUrl, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });

          if (clobResponse.ok) {
            const clobData = await clobResponse.json();
            if (clobData.price) {
              yesPrice = parseFloat(clobData.price);
              noPrice = 1 - yesPrice;
            }
          }
        } catch {
          // Use fallback prices
        }
      }

      prices.push({
        id: market.id,
        question: market.question,
        range,
        yes_price: yesPrice,
        no_price: noPrice,
        volume: parseFloat(market.volume || "0"),
        liquidity: parseFloat(market.liquidity || "0"),
      });
    }

    // Sort by range
    return prices.sort((a, b) => {
      const getRangeLow = (r: string) => {
        if (r.startsWith("<")) return 0;
        const match = r.match(/^(\d+)/);
        return match ? parseInt(match[1]) : 999;
      };
      return getRangeLow(a.range) - getRangeLow(b.range);
    });
  } catch (error) {
    console.error("[Polymarket] Failed to fetch prices:", error);
    return [];
  }
}

/**
 * Fetch Polymarket positions for user wallet
 */
async function fetchPolymarketPositions(): Promise<PolymarketPosition[]> {
  const walletAddress = process.env.POLYMARKET_WALLET_ADDRESS;
  if (!walletAddress) return [];

  try {
    const url = `${DATA_API_BASE}/positions?user=${walletAddress}&sizeThreshold=0.01`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[Polymarket] Positions API error:", response.status);
      return [];
    }

    const positions = await response.json();

    // Filter for snow-related positions
    const snowPositions = positions.filter((p: any) => {
      const title = (p.title || "").toLowerCase();
      return title.includes("snow") && title.includes("nyc");
    });

    return snowPositions.map((p: any) => {
      // Extract range from title
      let range = "";
      const title = (p.title || "").toLowerCase();
      if (title.includes("less than") || title.includes("<")) {
        const match = title.match(/(?:less than|<)\s*(\d+)/);
        range = match ? `<${match[1]}` : "";
      } else if (title.includes("or more") || title.includes("+")) {
        const match = title.match(/(\d+)\s*(?:or more|\+)/);
        range = match ? `${match[1]}+` : "";
      } else {
        const rangeMatch = title.match(/(\d+)[-–](\d+)/);
        range = rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : "";
      }

      return {
        conditionId: p.conditionId,
        outcomeIndex: p.outcomeIndex,
        size: parseFloat(p.size || "0"),
        avgPrice: parseFloat(p.avgPrice || "0"),
        currentPrice: parseFloat(p.curPrice || "0"),
        pnl: parseFloat(p.cashPnl || "0"),
        pnlPercent: parseFloat(p.percentPnl || "0"),
        range,
        isYes: p.outcomeIndex === 0,
      };
    });
  } catch (error) {
    console.error("[Polymarket] Positions fetch error:", error);
    return [];
  }
}

/**
 * Fetch Kalshi portfolio balance
 */
async function fetchKalshiBalance(): Promise<{ balance: number; payout: number } | null> {
  const headers = generateAuthHeaders("GET", "/portfolio/balance");
  if (!headers) return null;

  try {
    const response = await fetch(`${KALSHI_API_BASE}/portfolio/balance`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[Kalshi] Balance fetch error:", error);
    return null;
  }
}

/**
 * Fetch Kalshi positions
 */
async function fetchKalshiPositions(): Promise<any[]> {
  const headers = generateAuthHeaders("GET", "/portfolio/positions");
  if (!headers) return [];

  try {
    const response = await fetch(`${KALSHI_API_BASE}/portfolio/positions`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.market_positions || []).filter(
      (p: any) => p.ticker.includes("SNOW") && p.position !== 0
    );
  } catch (error) {
    console.error("[Kalshi] Positions fetch error:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const hasApiKey = !!process.env.KALSHI_API_KEY_ID;
  const hasPrivateKey = !!process.env.KALSHI_PRIVATE_KEY;

  console.log("[Stream] Starting real-time price stream...");

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Send initial connection status
      sendEvent({
        type: "connected",
        timestamp: new Date().toISOString(),
        auth: { hasApiKey, hasPrivateKey },
      });

      // Fetch all data function
      const fetchAllData = async () => {
        const [kalshiPrices, polymarketPrices, polymarketPositions, balance, positions] = await Promise.all([
          fetchKalshiPrices(),
          fetchPolymarketPrices(),
          fetchPolymarketPositions(),
          fetchKalshiBalance(),
          fetchKalshiPositions(),
        ]);

        return {
          type: "update",
          timestamp: new Date().toISOString(),
          kalshi: {
            prices: kalshiPrices,
            positions: positions.map((p: any) => ({
              ticker: p.ticker,
              position: p.position,
              avgPrice: p.market_exposure / Math.abs(p.position) / 100,
              exposure: p.market_exposure / 100,
            })),
          },
          polymarket: {
            prices: polymarketPrices,
            positions: polymarketPositions,
          },
          balance: balance
            ? {
                available: (balance.balance || 0) / 100,
                portfolioValue: (balance.payout || 0) / 100,
              }
            : null,
          authWorking: !!balance,
        };
      };

      // Initial fetch
      try {
        const initialData = await fetchAllData();
        initialData.type = "initial";
        sendEvent(initialData);
      } catch (error) {
        sendEvent({ type: "error", message: String(error) });
      }

      // Poll every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const data = await fetchAllData();
          sendEvent(data);
        } catch (error) {
          sendEvent({ type: "error", message: String(error) });
        }
      }, 2000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
