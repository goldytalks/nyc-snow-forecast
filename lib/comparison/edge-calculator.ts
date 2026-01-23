/**
 * Edge Calculator - Compare model probabilities to market prices
 * IMPORTANT: Market data is for COMPARISON ONLY, never used as model input
 */

export interface MarketPrice {
  threshold: number;
  yesPrice: number; // Price for YES (0-100)
  noPrice: number; // Price for NO (0-100)
  impliedProbability: number; // Derived from prices
  source: string;
}

export interface EdgeAnalysis {
  threshold: number;
  modelProb: number;
  marketProb: number;
  edge: number;
  edgePercent: number;
  direction: "BUY_YES" | "BUY_NO" | "NO_EDGE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  expectedValue: number;
}

/**
 * Calculate edge between model and market probabilities
 */
export function calculateEdge(
  modelProbabilities: Record<string, number>,
  marketPrices: MarketPrice[]
): EdgeAnalysis[] {
  const edges: EdgeAnalysis[] = [];
  const EDGE_THRESHOLD = 0.03; // 3% minimum edge to signal

  for (const market of marketPrices) {
    const threshold = market.threshold.toString();
    const modelProb = modelProbabilities[threshold];

    if (modelProb === undefined) continue;

    const marketProb = market.impliedProbability;
    const edge = modelProb - marketProb;
    const edgePercent = marketProb > 0 ? (edge / marketProb) * 100 : 0;

    // Determine direction
    let direction: EdgeAnalysis["direction"] = "NO_EDGE";
    if (edge > EDGE_THRESHOLD) {
      direction = "BUY_YES"; // Model says more likely than market
    } else if (edge < -EDGE_THRESHOLD) {
      direction = "BUY_NO"; // Model says less likely than market
    }

    // Calculate expected value
    // EV = (probability * payout) - (1 - probability) * cost
    const yesPrice = market.yesPrice / 100; // Convert to decimal
    const payout = 1 - yesPrice; // Profit if correct
    const ev =
      direction === "BUY_YES"
        ? modelProb * payout - (1 - modelProb) * yesPrice
        : direction === "BUY_NO"
          ? (1 - modelProb) * (yesPrice) - modelProb * (1 - yesPrice)
          : 0;

    // Confidence based on edge size
    let confidence: EdgeAnalysis["confidence"] = "LOW";
    if (Math.abs(edge) > 0.15) {
      confidence = "HIGH";
    } else if (Math.abs(edge) > 0.08) {
      confidence = "MEDIUM";
    }

    edges.push({
      threshold: market.threshold,
      modelProb,
      marketProb,
      edge,
      edgePercent,
      direction,
      confidence,
      expectedValue: Math.round(ev * 1000) / 1000,
    });
  }

  return edges;
}

/**
 * Get edges that are worth highlighting (|edge| > 5%)
 */
export function getSignificantEdges(edges: EdgeAnalysis[]): EdgeAnalysis[] {
  return edges
    .filter((e) => e.direction !== "NO_EDGE" && Math.abs(e.edge) >= 0.05)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
}

/**
 * Format edge for display
 */
export function formatEdge(edge: number): string {
  const sign = edge >= 0 ? "+" : "";
  return `${sign}${(edge * 100).toFixed(1)}%`;
}

/**
 * Default market prices (manually entered, would be fetched in production)
 * Based on hypothetical Kalshi/Polymarket prices
 * These are EXAMPLES only - update with real market data
 */
export function getDefaultMarketPrices(): MarketPrice[] {
  // Hypothetical market prices based on ~12" median pricing
  return [
    {
      threshold: 4,
      yesPrice: 95,
      noPrice: 5,
      impliedProbability: 0.95,
      source: "Example",
    },
    {
      threshold: 6,
      yesPrice: 88,
      noPrice: 12,
      impliedProbability: 0.88,
      source: "Example",
    },
    {
      threshold: 8,
      yesPrice: 75,
      noPrice: 25,
      impliedProbability: 0.75,
      source: "Example",
    },
    {
      threshold: 10,
      yesPrice: 60,
      noPrice: 40,
      impliedProbability: 0.60,
      source: "Example",
    },
    {
      threshold: 12,
      yesPrice: 45,
      noPrice: 55,
      impliedProbability: 0.45,
      source: "Example",
    },
    {
      threshold: 15,
      yesPrice: 25,
      noPrice: 75,
      impliedProbability: 0.25,
      source: "Example",
    },
    {
      threshold: 18,
      yesPrice: 12,
      noPrice: 88,
      impliedProbability: 0.12,
      source: "Example",
    },
    {
      threshold: 20,
      yesPrice: 6,
      noPrice: 94,
      impliedProbability: 0.06,
      source: "Example",
    },
  ];
}
