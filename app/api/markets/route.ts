/**
 * Market Data API
 * Fetches real-time prices from Kalshi and Polymarket
 * Falls back to manual prices if API discovery fails
 */

import { NextResponse } from "next/server";
import {
  fetchAllMarketData,
  calculateEdgeOpportunities,
  getModelProbabilities,
} from "@/lib/markets";
import {
  KALSHI_PRICES,
  POLYMARKET_PRICES,
  calculateAllEdges,
} from "@/lib/markets/manual-prices";
import { getCurrentForecast } from "@/lib/realtime/polling";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Get current model probabilities
    let modelProbabilities: Record<string, number>;
    try {
      const forecast = await getCurrentForecast();
      modelProbabilities = forecast.strikeProbabilities;
    } catch {
      // Fall back to defaults
      modelProbabilities = getModelProbabilities();
    }

    // Try to fetch live market data
    let marketData;
    let usedManualPrices = false;

    try {
      marketData = await fetchAllMarketData();
    } catch {
      marketData = null;
    }

    // If API didn't find markets, use manual prices
    const hasLiveKalshi = marketData?.kalshi.markets.length ?? 0 > 0;
    const hasLivePolymarket = marketData?.polymarket.markets.length ?? 0 > 0;

    let edges;
    if (!hasLiveKalshi && !hasLivePolymarket) {
      // Use manual prices
      usedManualPrices = true;
      edges = calculateAllEdges(modelProbabilities);
    } else {
      // Use live data
      edges = calculateEdgeOpportunities(modelProbabilities, marketData!);
    }

    const highValueEdges = edges.filter(
      (e: any) => e.direction !== "NO_EDGE" && Math.abs(e.edge) >= 0.05
    );

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      modelProbabilities,
      dataSource: usedManualPrices ? "manual" : "live",
      markets: usedManualPrices
        ? {
            kalshi: {
              status: "manual",
              markets: KALSHI_PRICES.map((p) => ({
                threshold: p.threshold,
                yesMid: p.yesPrice / 100,
                direction: "over",
              })),
            },
            polymarket: {
              status: "manual",
              markets: POLYMARKET_PRICES.map((p) => ({
                range: p.range,
                rangeType: p.rangeType,
                rangeLow: p.rangeLow,
                rangeHigh: p.rangeHigh,
                yesPrice: p.yesPrice / 100,
              })),
            },
          }
        : {
            kalshi: marketData?.kalshi,
            polymarket: marketData?.polymarket,
          },
      edges,
      highValueEdges,
      summary: {
        kalshiMarketsFound: usedManualPrices
          ? KALSHI_PRICES.length
          : marketData?.kalshi.markets.length || 0,
        polymarketMarketsFound: usedManualPrices
          ? POLYMARKET_PRICES.length
          : marketData?.polymarket.markets.length || 0,
        edgeOpportunities: highValueEdges.length,
        usingManualPrices: usedManualPrices,
      },
    });
  } catch (error) {
    console.error("Error fetching market data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch market data",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
