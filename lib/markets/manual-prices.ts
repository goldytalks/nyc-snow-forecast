/**
 * Market Price Configuration
 * UPDATE THESE WITH CURRENT MARKET PRICES
 *
 * Instructions:
 * 1. Check Kalshi and Polymarket for current YES prices
 * 2. Update the prices below (as percentages 0-100)
 * 3. Redeploy or refresh the page
 *
 * Polymarket: https://polymarket.com/event/how-many-inches-of-snow-in-nyc-this-weekend-jan-24-26
 *
 * Last Updated: 2026-01-23 2:57 PM EST
 */

export interface MarketPrice {
  threshold?: number;
  range?: string;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  rangeType?: "under" | "range" | "over";
  yesPrice: number; // 0-100 (percentage)
  source: "kalshi" | "polymarket";
  volume?: number;
}

// ============================================
// KALSHI PRICES - Update these with current YES prices
// https://kalshi.com/markets/kxsnowstorm/snowstorms/kxsnowstorm-26jannyc
// ============================================
export const KALSHI_PRICES: MarketPrice[] = [
  { threshold: 2, yesPrice: 97, source: "kalshi" },
  { threshold: 4, yesPrice: 93, source: "kalshi" },
  { threshold: 6, yesPrice: 85, source: "kalshi" },
  { threshold: 8, yesPrice: 72, source: "kalshi" },
  { threshold: 10, yesPrice: 58, source: "kalshi" },
  { threshold: 12, yesPrice: 42, source: "kalshi" },
  { threshold: 15, yesPrice: 22, source: "kalshi" },
];

// ============================================
// POLYMARKET PRICES - Update these with current YES prices
// https://polymarket.com/event/how-many-inches-of-snow-in-nyc-this-weekend-jan-24-26
// ============================================
export const POLYMARKET_PRICES: MarketPrice[] = [
  { range: "<4", rangeLow: null, rangeHigh: 4, rangeType: "under", yesPrice: 4, source: "polymarket", volume: 10145 },
  { range: "4-6", rangeLow: 4, rangeHigh: 6, rangeType: "range", yesPrice: 2, source: "polymarket", volume: 10145 },
  { range: "6-8", rangeLow: 6, rangeHigh: 8, rangeType: "range", yesPrice: 12, source: "polymarket", volume: 10145 },
  { range: "8-10", rangeLow: 8, rangeHigh: 10, rangeType: "range", yesPrice: 17, source: "polymarket", volume: 10145 },
  { range: "10-12", rangeLow: 10, rangeHigh: 12, rangeType: "range", yesPrice: 17, source: "polymarket", volume: 10145 },
  { range: "12-14", rangeLow: 12, rangeHigh: 14, rangeType: "range", yesPrice: 20, source: "polymarket", volume: 10145 },
  { range: "14+", rangeLow: 14, rangeHigh: null, rangeType: "over", yesPrice: 34, source: "polymarket", volume: 10145 },
];

/**
 * Calculate model probabilities for Polymarket ranges from strike probabilities
 */
export function calculateRangeProbabilities(
  modelStrikeProbabilities: Record<string, number>
): Record<string, number> {
  const get = (t: string) => modelStrikeProbabilities[t] || 0;

  return {
    "<4": 1 - get("4"),
    "4-6": get("4") - get("6"),
    "6-8": get("6") - get("8"),
    "8-10": get("8") - get("10"),
    "10-12": get("10") - get("12"),
    "12-14": get("12") - get("14"),
    "14+": get("14"),
  };
}

export interface EdgeAnalysis {
  market: string;
  type: "strike" | "range";
  threshold?: number;
  range?: string;
  modelProb: number;
  marketProb: number;
  edge: number;
  edgePct: number;
  direction: "BUY_YES" | "BUY_NO" | "NO_EDGE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  ev: number;
  kellyPct: number;
  source: "kalshi" | "polymarket";
  volume?: number;
}

/**
 * Calculate edges for all markets
 */
export function calculateAllEdges(
  modelStrikeProbabilities: Record<string, number>
): EdgeAnalysis[] {
  const edges: EdgeAnalysis[] = [];
  const EDGE_THRESHOLD = 0.03; // 3% minimum to show direction

  // Process Kalshi strikes
  for (const market of KALSHI_PRICES) {
    if (market.threshold === undefined) continue;

    const modelProb = modelStrikeProbabilities[market.threshold.toString()] || 0;
    const marketProb = market.yesPrice / 100;
    const edge = modelProb - marketProb;

    let direction: EdgeAnalysis["direction"] = "NO_EDGE";
    if (edge > EDGE_THRESHOLD) direction = "BUY_YES";
    if (edge < -EDGE_THRESHOLD) direction = "BUY_NO";

    // EV calculation
    const ev = direction === "BUY_YES"
      ? modelProb * (1 - marketProb) - (1 - modelProb) * marketProb
      : direction === "BUY_NO"
        ? (1 - modelProb) * marketProb - modelProb * (1 - marketProb)
        : 0;

    // Kelly criterion
    const prob = direction === "BUY_YES" ? modelProb : (1 - modelProb);
    const price = direction === "BUY_YES" ? marketProb : (1 - marketProb);
    const odds = (1 / price) - 1;
    const kelly = Math.max(0, (odds * prob - (1 - prob)) / odds);

    const confidence: EdgeAnalysis["confidence"] =
      Math.abs(edge) >= 0.12 ? "HIGH" :
      Math.abs(edge) >= 0.07 ? "MEDIUM" : "LOW";

    edges.push({
      market: `>${market.threshold}"`,
      type: "strike",
      threshold: market.threshold,
      modelProb,
      marketProb,
      edge,
      edgePct: edge * 100,
      direction,
      confidence,
      ev: Math.round(ev * 1000) / 1000,
      kellyPct: Math.round(kelly * 100 * 10) / 10,
      source: "kalshi",
    });
  }

  // Process Polymarket ranges
  const rangeProbabilities = calculateRangeProbabilities(modelStrikeProbabilities);

  for (const market of POLYMARKET_PRICES) {
    if (!market.range) continue;

    const modelProb = rangeProbabilities[market.range] || 0;
    const marketProb = market.yesPrice / 100;
    const edge = modelProb - marketProb;

    let direction: EdgeAnalysis["direction"] = "NO_EDGE";
    if (edge > EDGE_THRESHOLD) direction = "BUY_YES";
    if (edge < -EDGE_THRESHOLD) direction = "BUY_NO";

    const ev = direction === "BUY_YES"
      ? modelProb * (1 - marketProb) - (1 - modelProb) * marketProb
      : direction === "BUY_NO"
        ? (1 - modelProb) * marketProb - modelProb * (1 - marketProb)
        : 0;

    const prob = direction === "BUY_YES" ? modelProb : (1 - modelProb);
    const price = direction === "BUY_YES" ? marketProb : (1 - marketProb);
    const odds = price > 0 ? (1 / price) - 1 : 0;
    const kelly = odds > 0 ? Math.max(0, (odds * prob - (1 - prob)) / odds) : 0;

    const confidence: EdgeAnalysis["confidence"] =
      Math.abs(edge) >= 0.12 ? "HIGH" :
      Math.abs(edge) >= 0.07 ? "MEDIUM" : "LOW";

    edges.push({
      market: market.range,
      type: "range",
      range: market.range,
      modelProb,
      marketProb,
      edge,
      edgePct: edge * 100,
      direction,
      confidence,
      ev: Math.round(ev * 1000) / 1000,
      kellyPct: Math.round(kelly * 100 * 10) / 10,
      source: "polymarket",
      volume: market.volume,
    });
  }

  return edges;
}

/**
 * Get best opportunities sorted by edge
 */
export function getBestOpportunities(edges: EdgeAnalysis[]): EdgeAnalysis[] {
  return edges
    .filter(e => e.direction !== "NO_EDGE")
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
}
