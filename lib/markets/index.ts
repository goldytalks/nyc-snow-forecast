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
  modelProb: number;
  marketProb: number;
  edge: number;
  direction: "BUY_YES" | "BUY_NO";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "kalshi" | "polymarket";
  expectedValue: number;
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
 */
export function calculateEdgeOpportunities(
  modelProbabilities: Record<string, number>,
  marketData: MarketData
): EdgeOpportunity[] {
  const edges: EdgeOpportunity[] = [];
  const EDGE_THRESHOLD = 0.05; // 5% minimum edge

  // Process Kalshi strike markets
  for (const market of marketData.kalshi.markets) {
    if (market.direction !== "over") continue;

    const threshold = market.threshold.toString();
    const modelProb = modelProbabilities[threshold];

    if (modelProb === undefined) continue;

    const marketProb = market.yesMid;
    const edge = modelProb - marketProb;

    if (Math.abs(edge) >= EDGE_THRESHOLD) {
      edges.push({
        market: `Kalshi >${market.threshold}"`,
        threshold: market.threshold,
        modelProb,
        marketProb,
        edge,
        direction: edge > 0 ? "BUY_YES" : "BUY_NO",
        confidence: getConfidence(edge),
        source: "kalshi",
        expectedValue: calculateEV(edge, marketProb),
      });
    }
  }

  // Process Polymarket range markets
  for (const market of marketData.polymarket.markets) {
    // Calculate model probability for this range
    let modelProb: number;

    if (market.rangeType === "under" && market.rangeHigh !== null) {
      // P(X < rangeHigh) = 1 - P(X >= rangeHigh)
      const probOver = modelProbabilities[market.rangeHigh.toString()] || 0;
      modelProb = 1 - probOver;
    } else if (market.rangeType === "over" && market.rangeLow !== null) {
      // P(X >= rangeLow)
      modelProb = modelProbabilities[market.rangeLow.toString()] || 0;
    } else if (market.rangeLow !== null && market.rangeHigh !== null) {
      // P(rangeLow <= X < rangeHigh) = P(X >= rangeLow) - P(X >= rangeHigh)
      const probOverLow = modelProbabilities[market.rangeLow.toString()] || 0;
      const probOverHigh = modelProbabilities[market.rangeHigh.toString()] || 0;
      modelProb = probOverLow - probOverHigh;
    } else {
      continue;
    }

    const marketProb = market.yesPrice;
    const edge = modelProb - marketProb;

    if (Math.abs(edge) >= EDGE_THRESHOLD) {
      const range =
        market.rangeType === "under"
          ? `<${market.rangeHigh}"`
          : market.rangeType === "over"
            ? `${market.rangeLow}+"`
            : `${market.rangeLow}-${market.rangeHigh}"`;

      edges.push({
        market: `Polymarket ${range}`,
        range,
        modelProb,
        marketProb,
        edge,
        direction: edge > 0 ? "BUY_YES" : "BUY_NO",
        confidence: getConfidence(edge),
        source: "polymarket",
        expectedValue: calculateEV(edge, marketProb),
      });
    }
  }

  // Sort by absolute edge descending
  return edges.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
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
  // Defaults from recalibrated model (Feb 21, 2026)
  // Based on blizzard warning, NWS 10-16" guidance, model convergence
  // Model mean: 11.9", median: 12"
  return {
    "2": 1.0,
    "3": 0.998,
    "4": 0.989,
    "5": 0.965,
    "6": 0.907,
    "8": 0.769,
    "10": 0.613,
    "12": 0.438,
    "14": 0.30,
    "15": 0.246,
    "16": 0.19,
    "18": 0.135,
    "20": 0.067,
    "24": 0.006,
  };
}

export { type ParsedKalshiMarket, type ParsedPolymarketMarket };
