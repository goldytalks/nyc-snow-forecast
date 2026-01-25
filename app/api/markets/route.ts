/**
 * Market Data API
 * Fetches real-time prices from Kalshi and Polymarket
 * Includes orderbooks, positions, and both YES/NO sides
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
import {
  getNYCSnowstormMarketsWithDetails,
  getKalshiBalance,
  type KalshiMarketDetails,
  type KalshiPosition,
  type KalshiOrderbook,
} from "@/lib/markets/kalshi-auth";
import {
  getNYCSnowfallMarketsWithDetails as getPolymarketDetails,
  type PolymarketMarketDetails,
  type PolymarketPosition,
  type PolymarketOrderbook,
} from "@/lib/markets/polymarket-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Format Kalshi market for display with YES and NO sides
function formatKalshiMarket(market: KalshiMarketDetails) {
  const yesBid = market.yes_bid / 100;
  const yesAsk = market.yes_ask / 100;
  const noBid = market.no_bid / 100;
  const noAsk = market.no_ask / 100;
  const yesMid = (yesBid + yesAsk) / 2;
  const noMid = (noBid + noAsk) / 2;

  // Extract threshold from ticker (e.g., "KXSNOWSTORM-26JANNYC-8.0" -> 8)
  const tickerMatch = market.ticker.match(/-(\d+(?:\.\d+)?)$/);
  const threshold = tickerMatch ? parseFloat(tickerMatch[1]) : null;
  const displayTitle = threshold !== null
    ? `Above ${threshold}" of snow`
    : market.title;

  return {
    ticker: market.ticker,
    title: displayTitle,
    threshold,
    subtitle: market.subtitle || market.title,
    closeTime: market.close_time,
    expirationTime: market.expiration_time,
    status: market.status,
    yes: {
      bid: yesBid,
      ask: yesAsk,
      mid: yesMid,
      spread: yesAsk - yesBid,
    },
    no: {
      bid: noBid,
      ask: noAsk,
      mid: noMid,
      spread: noAsk - noBid,
    },
    volume: market.volume,
    volume24h: market.volume_24h,
    openInterest: market.open_interest,
  };
}

// Format Polymarket market for display with YES and NO sides
function formatPolymarketMarket(
  market: PolymarketMarketDetails,
  parsedMarkets?: any[]
) {
  // Try to get prices from parsed markets (which have live CLOB data)
  const parsedMarket = parsedMarkets?.find(
    (p) => p.id === market.id || p.slug === market.slug
  );

  let yesPrice = 0;
  let noPrice = 0;

  if (parsedMarket) {
    yesPrice = parsedMarket.yesPrice || 0;
    noPrice = parsedMarket.noPrice || 1 - yesPrice;
  } else {
    // Fall back to outcome prices from the market
    const prices = market.outcomePrices || [];
    yesPrice = parseFloat(prices[0] || "0");
    noPrice = parseFloat(prices[1] || "0") || 1 - yesPrice;
  }

  // Extract range type from question
  let rangeDisplay = market.groupItemTitle || "";
  if (!rangeDisplay) {
    const question = market.question.toLowerCase();
    if (question.includes("less than") || question.includes("<")) {
      const match = question.match(/(?:less than|<)\s*(\d+)/);
      rangeDisplay = match ? `<${match[1]}` : market.question;
    } else if (question.includes("or more") || question.includes("+")) {
      const match = question.match(/(\d+)\s*(?:or more|\+)/);
      rangeDisplay = match ? `${match[1]}+` : market.question;
    } else {
      const rangeMatch = question.match(/(\d+)[-–](\d+)/);
      rangeDisplay = rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : market.question;
    }
  }

  return {
    id: market.id,
    question: market.question,
    groupItemTitle: market.groupItemTitle,
    rangeDisplay,
    slug: market.slug,
    endDate: market.end_date,
    yes: {
      price: yesPrice,
      impliedProb: yesPrice,
    },
    no: {
      price: noPrice,
      impliedProb: noPrice,
    },
    volume: parseFloat(market.volume || "0"),
    liquidity: parseFloat(market.liquidity || "0"),
    active: market.active,
    closed: market.closed,
  };
}

export async function GET() {
  try {
    // Get current model probabilities
    let modelProbabilities: Record<string, number>;
    let polymarketBucketProbabilities: Record<string, number> = {};
    try {
      const forecast = await getCurrentForecast();
      modelProbabilities = forecast.strikeProbabilities;
      // Get Polymarket bucket probabilities directly from the model
      polymarketBucketProbabilities = forecast.polymarketProbabilities || {};
    } catch {
      // Fall back to defaults
      modelProbabilities = getModelProbabilities();
    }

    // Fetch detailed Kalshi data (including positions, orderbooks, and balance)
    let kalshiDetails: {
      markets: KalshiMarketDetails[];
      positions: KalshiPosition[];
      orderbooks: Record<string, KalshiOrderbook>;
      authStatus?: { authenticated: boolean; error?: string };
    } = { markets: [], positions: [], orderbooks: {}, authStatus: { authenticated: false } };

    let kalshiBalance: {
      balance: number;
      portfolioValue: number;
      availableBalance: number;
      authStatus: { authenticated: boolean; error?: string };
    } = {
      balance: 0,
      portfolioValue: 0,
      availableBalance: 0,
      authStatus: { authenticated: false, error: "Not fetched" },
    };

    try {
      // Fetch markets/positions and balance in parallel
      const [details, balance] = await Promise.all([
        getNYCSnowstormMarketsWithDetails(),
        getKalshiBalance(),
      ]);
      kalshiDetails = details;
      kalshiBalance = balance;
    } catch (error) {
      console.error("[API] Failed to fetch Kalshi details:", error);
    }

    // Fetch detailed Polymarket data
    let polymarketDetails: {
      markets: PolymarketMarketDetails[];
      positions: PolymarketPosition[];
      orderbooks: Record<string, PolymarketOrderbook>;
      eventTitle: string;
      eventEndDate: string;
    } = {
      markets: [],
      positions: [],
      orderbooks: {},
      eventTitle: "NYC Snowfall Jan 24-26",
      eventEndDate: "",
    };

    try {
      polymarketDetails = await getPolymarketDetails();
    } catch (error) {
      console.error("[API] Failed to fetch Polymarket details:", error);
    }

    // Try to fetch basic market data for edge calculation
    let marketData;
    let usedManualPrices = false;

    try {
      marketData = await fetchAllMarketData();
    } catch {
      marketData = null;
    }

    // If API didn't find markets, use manual prices
    const hasLiveKalshi =
      kalshiDetails.markets.length > 0 ||
      (marketData?.kalshi.markets.length ?? 0) > 0;
    const hasLivePolymarket =
      polymarketDetails.markets.length > 0 ||
      (marketData?.polymarket.markets.length ?? 0) > 0;

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

    // Format markets with YES/NO sides
    const formattedKalshiMarkets = kalshiDetails.markets
      .map(formatKalshiMarket)
      .sort((a, b) => (a.threshold || 0) - (b.threshold || 0));

    // Get parsed Polymarket markets with live prices
    const parsedPolymarkets = marketData?.polymarket?.markets || [];
    const formattedPolymarketMarkets = polymarketDetails.markets
      .map((m) => formatPolymarketMarket(m, parsedPolymarkets))
      .sort((a, b) => {
        // Sort by range: <4, 4-6, 6-8, etc.
        const getRangeLow = (display: string) => {
          if (display.startsWith("<")) return 0;
          const match = display.match(/^(\d+)/);
          return match ? parseInt(match[1]) : 999;
        };
        return getRangeLow(a.rangeDisplay) - getRangeLow(b.rangeDisplay);
      });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      modelProbabilities,
      polymarketBucketProbabilities,
      dataSource: usedManualPrices ? "manual" : "live",

      // Kalshi data with P&L calculation and bet sizing
      kalshi: (() => {
        const availableBalance = kalshiBalance.availableBalance;
        // Calculate unrealized P&L for each position based on current market prices
        const positionsWithPnL = kalshiDetails.positions.map((pos) => {
          const market = formattedKalshiMarkets.find((m) => m.ticker === pos.ticker);
          const entryPrice = pos.average_price;
          const positionSize = Math.abs(pos.position);
          // position > 0 means LONG YES shares
          // position < 0 means LONG NO shares (short YES)
          const isLongYes = pos.position > 0;
          const isLongNo = pos.position < 0;

          // Use the correct price for the position side
          // For YES positions, use YES mid price
          // For NO positions, use NO mid price
          const currentPrice = isLongYes
            ? (market?.yes?.mid || 0)
            : (market?.no?.mid || 0);

          // P&L calculation:
          // For YES positions: profit when YES price goes up
          // For NO positions: profit when NO price goes up
          // In both cases: P&L = (current - entry) * size
          const unrealizedPnl = (currentPrice - entryPrice) * positionSize;

          // Current value is based on the position's side
          const currentValue = currentPrice * positionSize;

          return {
            ...pos,
            currentPrice,
            unrealized_pnl: unrealizedPnl,
            current_value: currentValue,
            pnl_percent: pos.total_cost > 0 ? (unrealizedPnl / pos.total_cost) * 100 : 0,
          };
        });

        // Calculate totals
        const totalCost = positionsWithPnL.reduce((sum, p) => sum + p.total_cost, 0);
        const totalUnrealizedPnl = positionsWithPnL.reduce((sum, p) => sum + p.unrealized_pnl, 0);
        const totalCurrentValue = positionsWithPnL.reduce((sum, p) => sum + p.current_value, 0);

        return {
          eventTitle: "NYC Snowstorm Jan 26",
          eventTicker: "KXSNOWSTORM-26JANNYC",
          markets: formattedKalshiMarkets,
          positions: positionsWithPnL,
          positionSummary: {
            totalCost,
            totalUnrealizedPnl,
            totalCurrentValue,
            totalPnlPercent: totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0,
          },
          orderbooks: kalshiDetails.orderbooks,
          marketsFound: formattedKalshiMarkets.length,
          authStatus: kalshiDetails.authStatus || { authenticated: false },
          // Balance info
          balance: {
            available: availableBalance,
            portfolioValue: kalshiBalance.portfolioValue,
            total: kalshiBalance.balance,
          },
          // Kelly-based bet sizing recommendations
          betSizing: edges
            .filter((e: any) => e.direction !== "NO_EDGE" && e.source === "kalshi")
            .map((e: any) => {
              const modelProb = e.direction === "BUY_YES" ? e.modelProbYes : (1 - e.modelProbYes);
              const marketProb = e.direction === "BUY_YES" ? e.marketProbYes : (1 - e.marketProbYes);
              const price = marketProb;
              const odds = price > 0 ? (1 / price) - 1 : 0;
              const kellyFraction = odds > 0 ? Math.max(0, (odds * modelProb - (1 - modelProb)) / odds) : 0;
              const halfKelly = kellyFraction / 2;
              const recommendedBet = availableBalance * halfKelly;
              const contracts = price > 0 ? Math.floor(recommendedBet / price) : 0;

              // Sell target: when edge erodes to <3%
              const entryPrice = price;
              const sellTarget = e.direction === "BUY_YES"
                ? Math.min(0.97, modelProb + 0.02) // Sell YES when market catches up to model - 2%
                : Math.max(0.03, (1 - modelProb) - 0.02); // Sell NO when market catches up

              return {
                market: e.market,
                threshold: e.threshold,
                direction: e.direction,
                edge: Math.round(e.edge * 1000) / 10, // percentage
                modelProb: Math.round(modelProb * 1000) / 10,
                marketProb: Math.round(marketProb * 1000) / 10,
                kellyFraction: Math.round(kellyFraction * 1000) / 10,
                halfKelly: Math.round(halfKelly * 1000) / 10,
                recommendedBet: Math.round(recommendedBet * 100) / 100,
                contracts,
                entryPrice: Math.round(entryPrice * 100), // in cents
                sellTarget: Math.round(sellTarget * 100), // in cents
                confidence: e.confidence,
              };
            })
            .filter((b: any) => b.recommendedBet > 0.5) // Only show if >$0.50 recommended
            .sort((a: any, b: any) => b.edge - a.edge),
        };
      })(),

      // Polymarket data
      polymarket: {
        eventTitle: polymarketDetails.eventTitle,
        eventSlug: "how-many-inches-of-snow-in-nyc-this-weekend-jan-24-26",
        eventEndDate: polymarketDetails.eventEndDate,
        markets: formattedPolymarketMarkets,
        positions: polymarketDetails.positions,
        orderbooks: polymarketDetails.orderbooks,
        marketsFound: formattedPolymarketMarkets.length,
      },

      // Legacy format for backward compatibility
      markets: usedManualPrices
        ? {
            kalshi: {
              status: "manual",
              markets: KALSHI_PRICES.map((p) => ({
                threshold: p.threshold,
                yesMid: p.yesPrice / 100,
                noMid: 1 - p.yesPrice / 100,
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
                noPrice: 1 - p.yesPrice / 100,
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
        kalshiMarketsFound: formattedKalshiMarkets.length || KALSHI_PRICES.length,
        polymarketMarketsFound:
          formattedPolymarketMarkets.length || POLYMARKET_PRICES.length,
        edgeOpportunities: highValueEdges.length,
        usingManualPrices: usedManualPrices,
        kalshiPositions: kalshiDetails.positions.length,
        polymarketPositions: polymarketDetails.positions.length,
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
