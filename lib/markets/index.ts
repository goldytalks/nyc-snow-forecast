/**
 * Unified Market Data Fetcher
 * Combines Kalshi and Polymarket data
 */

import {
  fetchNYCSnowfallMarkets as fetchKalshiMarkets,
  formatKalshiForComparison,
  type ParsedKalshiMarket,
} from "./kalshi";
import {
  fetchNYCSnowfallMarkets as fetchPolymarketMarkets,
  formatPolymarketForComparison,
  type ParsedPolymarketMarket,
} from "./polymarket";

export interface MarketData {
  timestamp: string;
  kalshi: {
    status: "success" | "error" | "no_markets";
    markets: ParsedKalshiMarket[];
    error?: string;
  };
  polymarket: {
    status: "success" | "error" | "no_markets";
    markets: ParsedPolymarketMarket[];
    error?: string;
  };
}

export interface StrikeMarketData {
  threshold: number;
  kalshi?: {
    yesMid: number;
    yesBid: number;
    yesAsk: number;
    volume: number;
  };
  polymarket?: {
    yesPrice: number;
    volume: number;
  };
  combinedImpliedProb: number;
}

export interface RangeMarketData {
  range: string;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeType: "under" | "range" | "over";
  polymarket?: {
    yesPrice: number;
    volume: number;
  };
}

export interface EdgeOpportunity {
  market: string;
  threshold?: number;
  range?: string;
  modelProb: number;      // Model probability for the recommended side
  marketProb: number;     // Market probability for the recommended side
  modelProbYes: number;   // Always the YES side model prob
  marketProbYes: number;  // Always the YES side market prob
  edge: number;           // Always positive for the recommended side
  edgePct: number;        // edge * 100, always positive
  direction: "BUY_YES" | "BUY_NO" | "NO_EDGE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "kalshi" | "polymarket";
  expectedValue: number;
  kellyPct: number;
}

/**
 * Fetch all market data from both platforms
 */
export async function fetchAllMarketData(): Promise<MarketData> {
  const timestamp = new Date().toISOString();

  const [kalshiResult, polymarketResult] = await Promise.allSettled([
    fetchKalshiMarkets(),
    fetchPolymarketMarkets(),
  ]);

  // Process Kalshi
  let kalshiData: MarketData["kalshi"];
  if (kalshiResult.status === "fulfilled") {
    kalshiData =
      kalshiResult.value.length > 0
        ? { status: "success", markets: kalshiResult.value }
        : { status: "no_markets", markets: [] };
  } else {
    kalshiData = {
      status: "error",
      markets: [],
      error: kalshiResult.reason?.message,
    };
  }

  // Process Polymarket
  let polymarketData: MarketData["polymarket"];
  if (polymarketResult.status === "fulfilled") {
    polymarketData =
      polymarketResult.value.length > 0
        ? { status: "success", markets: polymarketResult.value }
        : { status: "no_markets", markets: [] };
  } else {
    polymarketData = {
      status: "error",
      markets: [],
      error: polymarketResult.reason?.message,
    };
  }

  return {
    timestamp,
    kalshi: kalshiData,
    polymarket: polymarketData,
  };
}

/**
 * Calculate edge opportunities comparing model to market
 * Edge is ALWAYS shown as positive for the recommended side (YES or NO)
 */
export function calculateEdgeOpportunities(
  modelProbabilities: Record<string, number>,
  marketData: MarketData
): EdgeOpportunity[] {
  const edges: EdgeOpportunity[] = [];
  const EDGE_THRESHOLD = 0.03; // 3% minimum edge

  // Process Kalshi strike markets
  for (const market of marketData.kalshi.markets) {
    if (market.direction !== "over") continue;

    const threshold = market.threshold.toString();
    const modelProbYes = modelProbabilities[threshold];

    if (modelProbYes === undefined) continue;

    const marketProbYes = market.yesMid;
    const rawEdge = modelProbYes - marketProbYes;

    // Determine direction: positive rawEdge = buy YES, negative rawEdge = buy NO
    let direction: EdgeOpportunity["direction"] = "NO_EDGE";
    if (rawEdge > EDGE_THRESHOLD) direction = "BUY_YES";
    if (rawEdge < -EDGE_THRESHOLD) direction = "BUY_NO";

    if (direction === "NO_EDGE") continue;

    // For BUY_NO, show the NO side probabilities and positive edge
    const modelProb = direction === "BUY_NO" ? (1 - modelProbYes) : modelProbYes;
    const marketProb = direction === "BUY_NO" ? (1 - marketProbYes) : marketProbYes;
    const edge = Math.abs(rawEdge); // Always positive for recommended side

    // Kelly criterion calculation
    const prob = modelProb;
    const price = marketProb;
    const odds = price > 0 && price < 1 ? (1 / price) - 1 : 0;
    const kelly = odds > 0 ? Math.max(0, (odds * prob - (1 - prob)) / odds) : 0;

    edges.push({
      market: `Kalshi >${market.threshold}"`,
      threshold: market.threshold,
      modelProb,
      marketProb,
      modelProbYes,
      marketProbYes,
      edge,
      edgePct: edge * 100,
      direction,
      confidence: getConfidence(rawEdge),
      source: "kalshi",
      expectedValue: calculateEV(rawEdge, marketProbYes),
      kellyPct: Math.round(kelly * 100 * 10) / 10,
    });
  }

  // Process Polymarket range markets
  for (const market of marketData.polymarket.markets) {
    // Calculate model probability for this range (YES side)
    let modelProbYes: number;

    if (market.rangeType === "under" && market.rangeHigh !== null) {
      // P(X < rangeHigh) = 1 - P(X >= rangeHigh)
      const probOver = modelProbabilities[market.rangeHigh.toString()] || 0;
      modelProbYes = 1 - probOver;
    } else if (market.rangeType === "over" && market.rangeLow !== null) {
      // P(X >= rangeLow)
      modelProbYes = modelProbabilities[market.rangeLow.toString()] || 0;
    } else if (market.rangeLow !== null && market.rangeHigh !== null) {
      // P(rangeLow <= X < rangeHigh) = P(X >= rangeLow) - P(X >= rangeHigh)
      const probOverLow = modelProbabilities[market.rangeLow.toString()] || 0;
      const probOverHigh = modelProbabilities[market.rangeHigh.toString()] || 0;
      modelProbYes = probOverLow - probOverHigh;
    } else {
      continue;
    }

    const marketProbYes = market.yesPrice;
    const rawEdge = modelProbYes - marketProbYes;

    // Determine direction
    let direction: EdgeOpportunity["direction"] = "NO_EDGE";
    if (rawEdge > EDGE_THRESHOLD) direction = "BUY_YES";
    if (rawEdge < -EDGE_THRESHOLD) direction = "BUY_NO";

    if (direction === "NO_EDGE") continue;

    // For BUY_NO, show the NO side probabilities and positive edge
    const modelProb = direction === "BUY_NO" ? (1 - modelProbYes) : modelProbYes;
    const marketProb = direction === "BUY_NO" ? (1 - marketProbYes) : marketProbYes;
    const edge = Math.abs(rawEdge); // Always positive for recommended side

    const range =
      market.rangeType === "under"
        ? `<${market.rangeHigh}"`
        : market.rangeType === "over"
          ? `${market.rangeLow}+"`
          : `${market.rangeLow}-${market.rangeHigh}"`;

    // Kelly criterion calculation
    const prob = modelProb;
    const price = marketProb;
    const odds = price > 0 && price < 1 ? (1 / price) - 1 : 0;
    const kelly = odds > 0 ? Math.max(0, (odds * prob - (1 - prob)) / odds) : 0;

    edges.push({
      market: `Polymarket ${range}`,
      range,
      modelProb,
      marketProb,
      modelProbYes,
      marketProbYes,
      edge,
      edgePct: edge * 100,
      direction,
      confidence: getConfidence(rawEdge),
      source: "polymarket",
      expectedValue: calculateEV(rawEdge, marketProbYes),
      kellyPct: Math.round(kelly * 100 * 10) / 10,
    });
  }

  // Sort by edge descending (always positive now)
  return edges.sort((a, b) => b.edge - a.edge);
}

function getConfidence(edge: number): "HIGH" | "MEDIUM" | "LOW" {
  const absEdge = Math.abs(edge);
  if (absEdge >= 0.15) return "HIGH";
  if (absEdge >= 0.10) return "MEDIUM";
  return "LOW";
}

function calculateEV(edge: number, marketProb: number): number {
  // Simplified EV calculation
  // For BUY_YES: EV = (modelProb * (1 - marketProb)) - ((1 - modelProb) * marketProb)
  // Simplified: EV ≈ edge
  return Math.round(edge * 100) / 100;
}

/**
 * Get model probabilities for standard thresholds
 */
export function getModelProbabilities(): Record<string, number> {
  // These come from the dynamic scenario model
  // Using defaults based on current NWS guidance
  return {
    "2": 0.985,
    "4": 0.96,
    "6": 0.91,
    "8": 0.79,
    "10": 0.63,
    "12": 0.40,
    "14": 0.28,
    "15": 0.23,
    "16": 0.18,
    "18": 0.13,
    "20": 0.06,
    "24": 0.015,
  };
}

export { type ParsedKalshiMarket, type ParsedPolymarketMarket };
