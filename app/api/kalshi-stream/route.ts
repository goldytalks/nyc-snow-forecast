/**
 * Kalshi Real-Time Price Stream (SSE)
 * Connects to Kalshi WebSocket and streams updates to clients
 */

import { NextRequest } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const EVENT_TICKER = "KXSNOWSTORM-26JANNYC";

// Market tickers for snow event
const SNOW_TICKERS = [
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

interface MarketPrice {
  ticker: string;
  threshold: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume_24h: number;
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
 * Fetch current market prices directly from REST API
 */
async function fetchCurrentPrices(): Promise<MarketPrice[]> {
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

    return markets.map((m: any) => {
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
    }).sort((a: MarketPrice, b: MarketPrice) => a.threshold - b.threshold);
  } catch (error) {
    console.error("[Kalshi Stream] Failed to fetch prices:", error);
    return [];
  }
}

/**
 * Fetch portfolio balance
 */
async function fetchBalance(): Promise<{ balance: number; payout: number } | null> {
  const headers = generateAuthHeaders("GET", "/portfolio/balance");
  if (!headers) return null;

  try {
    const response = await fetch(`${KALSHI_API_BASE}/portfolio/balance`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kalshi] Balance error:", response.status, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[Kalshi] Balance fetch error:", error);
    return null;
  }
}

/**
 * Fetch portfolio positions
 */
async function fetchPositions(): Promise<any[]> {
  const headers = generateAuthHeaders("GET", "/portfolio/positions");
  if (!headers) return [];

  try {
    const response = await fetch(`${KALSHI_API_BASE}/portfolio/positions`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kalshi] Positions error:", response.status, errorText);
      return [];
    }

    const data = await response.json();
    return (data.market_positions || []).filter((p: any) =>
      p.ticker.includes("SNOW") && p.position !== 0
    );
  } catch (error) {
    console.error("[Kalshi] Positions fetch error:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Check for env vars and log debug info
  const hasApiKey = !!process.env.KALSHI_API_KEY_ID;
  const hasPrivateKey = !!process.env.KALSHI_PRIVATE_KEY;
  const privateKeyPreview = process.env.KALSHI_PRIVATE_KEY?.substring(0, 50) || "NOT SET";

  console.log("[Kalshi Stream] Starting...");
  console.log("[Kalshi Stream] API Key ID present:", hasApiKey);
  console.log("[Kalshi Stream] Private Key present:", hasPrivateKey);
  console.log("[Kalshi Stream] Private Key preview:", privateKeyPreview);

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send initial connection status
      sendEvent({
        type: "connected",
        timestamp: new Date().toISOString(),
        auth: {
          hasApiKey,
          hasPrivateKey,
        },
      });

      // Fetch and send data every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const [prices, balance, positions] = await Promise.all([
            fetchCurrentPrices(),
            fetchBalance(),
            fetchPositions(),
          ]);

          sendEvent({
            type: "update",
            timestamp: new Date().toISOString(),
            prices,
            balance: balance ? {
              available: (balance.balance || 0) / 100,
              payout: (balance.payout || 0) / 100,
            } : null,
            positions: positions.map((p: any) => ({
              ticker: p.ticker,
              position: p.position,
              avgPrice: p.market_exposure / Math.abs(p.position) / 100,
              exposure: p.market_exposure / 100,
            })),
            authWorking: !!balance,
          });
        } catch (error) {
          sendEvent({
            type: "error",
            message: String(error),
            timestamp: new Date().toISOString(),
          });
        }
      }, 2000);

      // Initial fetch
      const [prices, balance, positions] = await Promise.all([
        fetchCurrentPrices(),
        fetchBalance(),
        fetchPositions(),
      ]);

      sendEvent({
        type: "initial",
        timestamp: new Date().toISOString(),
        prices,
        balance: balance ? {
          available: (balance.balance || 0) / 100,
          payout: (balance.payout || 0) / 100,
        } : null,
        positions: positions.map((p: any) => ({
          ticker: p.ticker,
          position: p.position,
          avgPrice: p.market_exposure / Math.abs(p.position) / 100,
          exposure: p.market_exposure / 100,
        })),
        authWorking: !!balance,
      });

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
