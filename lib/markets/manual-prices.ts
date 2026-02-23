/**
 * Market Price Configuration
 * UPDATE THESE WITH CURRENT MARKET PRICES
 *
 * Instructions:
 * 1. Check Kalshi and Polymarket for current YES prices
 * 2. Update the prices below (as percentages 0-100)
 * 3. Redeploy or refresh the page
 *
 * Kalshi: https://kalshi.com/markets/kxsnowstorm/snowstorms/KXSNOWSTORM-26FEBNYC2
 * Polymarket: https://polymarket.com/event/how-many-inches-of-snow-in-nyc-this-weekend-february-21-23-273
 *
 * Last Updated: 2026-02-21 ~11:30 AM ET (from Kalshi/market aggregator data)
 * Kalshi confirmed: >10"=72%, >12"=61%, >15"=37%, implied mean ~13.9"
 * Polymarket ranges derived from Kalshi strike curve for consistency
 * NOTE: Live API data is preferred when available
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
// https://kalshi.com/markets/kxsnowstorm/snowstorms/KXSNOWSTORM-26FEBNYC2
// ============================================
export const KALSHI_PRICES: MarketPrice[] = [
  { threshold: 2, yesPrice: 99, source: "kalshi" },
  { threshold: 3, yesPrice: 99, source: "kalshi" },
  { threshold: 4, yesPrice: 99, source: "kalshi" },
  { threshold: 5, yesPrice: 99, source: "kalshi" },
  { threshold: 6, yesPrice: 99, source: "kalshi" },
  { threshold: 8, yesPrice: 99, source: "kalshi" },
  { threshold: 10, yesPrice: 99, source: "kalshi" },
  { threshold: 12, yesPrice: 99, source: "kalshi" },
  { threshold: 15, yesPrice: 99, source: "kalshi" },
  { threshold: 18, yesPrice: 98, source: "kalshi" },
  { threshold: 20, yesPrice: 82, source: "kalshi" },
  { threshold: 22, yesPrice: 45, source: "kalshi" },
  { threshold: 24, yesPrice: 9, source: "kalshi" },
];

// ============================================
// POLYMARKET PRICES - Update these with current YES prices
// https://polymarket.com/event/how-many-inches-of-snow-in-nyc-this-weekend-february-21-23-273
// ============================================
export const POLYMARKET_PRICES: MarketPrice[] = [
  { range: "<8", rangeLow: null, rangeHigh: 8, rangeType: "under", yesPrice: 3, source: "polymarket", volume: 15000 },
  { range: "8-10", rangeLow: 8, rangeHigh: 10, rangeType: "range", yesPrice: 5, source: "polymarket", volume: 15000 },
  { range: "10-12", rangeLow: 10, rangeHigh: 12, rangeType: "range", yesPrice: 7, source: "polymarket", volume: 15000 },
  { range: "12-14", rangeLow: 12, rangeHigh: 14, rangeType: "range", yesPrice: 10, source: "polymarket", volume: 15000 },
  { range: "14-16", rangeLow: 14, rangeHigh: 16, rangeType: "range", yesPrice: 12, source: "polymarket", volume: 15000 },
  { range: "16-18", rangeLow: 16, rangeHigh: 18, rangeType: "range", yesPrice: 15, source: "polymarket", volume: 15000 },
  { range: "18-20", rangeLow: 18, rangeHigh: 20, rangeType: "range", yesPrice: 18, source: "polymarket", volume: 15000 },
  { range: "20+", rangeLow: 20, rangeHigh: null, rangeType: "over", yesPrice: 30, source: "polymarket", volume: 15000 },
];

/**
 * Calculate model probabilities for Polymarket ranges from strike probabilities
 */
export function calculateRangeProbabilities(
  modelStrikeProbabilities: Record<string, number>
): Record<string, number> {
  const get = (t: string) => modelStrikeProbabilities[t] || 0;

  return {
    "<8": 1 - get("8"),
    "8-10": get("8") - get("10"),
    "10-12": get("10") - get("12"),
    "12-14": get("12") - get("14"),
    "14-16": get("14") - get("16"),
    "16-18": get("16") - get("18"),
    "18-20": get("18") - get("20"),
    "20+": get("20"),
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
  modelStrikeProbabilities: Record<string, number>,
  polymarketProbabilities?: Record<string, number>
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
      edgePct: Math.abs(edge) * 100,
      direction,
      confidence,
      ev: Math.round(ev * 1000) / 1000,
      kellyPct: Math.round(kelly * 100 * 10) / 10,
      source: "kalshi",
    });
  }

  // Process Polymarket ranges
  // Use dedicated Polymarket probabilities if provided, otherwise derive from Kalshi strikes
  const rangeProbabilities = polymarketProbabilities || calculateRangeProbabilities(modelStrikeProbabilities);

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
      edgePct: Math.abs(edge) * 100,
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
