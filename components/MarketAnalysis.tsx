"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ExternalLink,
  Target,
  RefreshCw,
  Wallet,
  BookOpen,
} from "lucide-react";
import {
  calculateAllEdges,
  getBestOpportunities,
  calculateRangeProbabilities,
  type EdgeAnalysis,
} from "@/lib/markets/manual-prices";

interface MarketAnalysisProps {
  strikeProbabilities: Record<string, number>;
}

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  closeTime: string;
  expirationTime: string;
  status: string;
  yes: { bid: number; ask: number; mid: number; spread: number };
  no: { bid: number; ask: number; mid: number; spread: number };
  volume: number;
  volume24h: number;
  openInterest: number;
}

interface PolymarketMarket {
  id: string;
  question: string;
  groupItemTitle?: string;
  slug: string;
  endDate: string;
  yes: { price: number; impliedProb: number };
  no: { price: number; impliedProb: number };
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
}

interface Position {
  ticker?: string;
  market_id?: string;
  market_title?: string;
  market_question?: string;
  position?: number;
  size?: number;
  outcome?: string;
  average_price: number;
  currentPrice?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  current_value?: number;
  total_cost?: number;
  pnl_percent?: number;
}

interface PositionSummary {
  totalCost: number;
  totalUnrealizedPnl: number;
  totalCurrentValue: number;
  totalPnlPercent: number;
}

interface AuthStatus {
  authenticated: boolean;
  error?: string;
}

interface MarketAPIResponse {
  timestamp: string;
  dataSource: "live" | "manual";
  edges: EdgeAnalysis[];
  highValueEdges: EdgeAnalysis[];
  kalshi: {
    eventTitle: string;
    eventTicker: string;
    markets: KalshiMarket[];
    positions: Position[];
    positionSummary?: PositionSummary;
    orderbooks: Record<string, any>;
    marketsFound: number;
    authStatus?: AuthStatus;
  };
  polymarket: {
    eventTitle: string;
    eventSlug: string;
    eventEndDate: string;
    markets: PolymarketMarket[];
    positions: Position[];
    orderbooks: Record<string, any>;
    marketsFound: number;
  };
  summary: {
    kalshiMarketsFound: number;
    polymarketMarketsFound: number;
    edgeOpportunities: number;
    usingManualPrices: boolean;
    kalshiPositions: number;
    polymarketPositions: number;
  };
}

// Helper to safely get edge percentage (always positive — direction tells you YES/NO)
const getEdgePct = (edge: any): number => {
  if (edge.edgePct !== undefined) return Math.abs(edge.edgePct);
  if (edge.edge !== undefined) return Math.abs(edge.edge) * 100;
  return 0;
};

// Helper to get edge direction label
const getEdgeLabel = (edge: any): string => {
  if (!edge || edge.direction === "NO_EDGE") return "";
  return edge.direction === "BUY_YES" ? "YES" : "NO";
};

// Helper to safely get kelly percentage
const getKellyPct = (edge: any): number => {
  if (edge.kellyPct !== undefined) return edge.kellyPct;
  if (edge.expectedValue !== undefined) return Math.abs(edge.expectedValue) * 100;
  return 0;
};

// Helper to safely format percentage
const formatProb = (prob: number | undefined): string => {
  if (prob === undefined || prob === null || isNaN(prob)) return "—";
  return `${(prob * 100).toFixed(0)}%`;
};

// Helper to format price
const formatPrice = (price: number | undefined): string => {
  if (price === undefined || price === null || isNaN(price)) return "—";
  return `${(price * 100).toFixed(1)}¢`;
};

// Helper to format time
const formatTime = (isoString: string | undefined): string => {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

export function MarketAnalysis({ strikeProbabilities }: MarketAnalysisProps) {
  const [liveData, setLiveData] = useState<MarketAPIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Fetch live market data
  const fetchMarketData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/markets");
      if (response.ok) {
        const data = await response.json();
        setLiveData(data);
        setLastFetch(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch market data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount and every 10 seconds for near-real-time updates
  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Use live data if available, otherwise fall back to manual calculation
  const edges = useMemo(() => {
    if (liveData?.edges) {
      return liveData.edges;
    }
    return calculateAllEdges(strikeProbabilities);
  }, [liveData, strikeProbabilities]);

  const opportunities = useMemo(() => getBestOpportunities(edges), [edges]);

  const kalshiEdges = edges.filter((e) => e.source === "kalshi");
  const polymarketEdges = edges.filter((e) => e.source === "polymarket");

  const isLive = liveData?.dataSource === "live";

  // Calculate total positions value
  const totalKalshiPositions = liveData?.kalshi?.positions?.length || 0;
  const totalPolymarketPositions = liveData?.polymarket?.positions?.length || 0;

  return (
    <div className="space-y-6">
      {/* Data Source Status */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : isLive ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live prices
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Manual prices
            </span>
          )}
          {lastFetch && (
            <span className="text-muted-foreground">
              Updated {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={fetchMarketData}
          disabled={isLoading}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Portfolio Summary - Your Positions & P&L */}
      {liveData?.kalshi?.positions && liveData.kalshi.positions.length > 0 && (
        <Card className="bg-card border-border border-emerald-500/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  Your Positions & P&L
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Real-time portfolio tracking on Kalshi
                </p>
              </div>
              {liveData.kalshi.positionSummary && (
                <div className="text-right">
                  <div className={`text-2xl font-bold font-mono ${
                    liveData.kalshi.positionSummary.totalUnrealizedPnl >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}>
                    {liveData.kalshi.positionSummary.totalUnrealizedPnl >= 0 ? "+" : ""}
                    ${liveData.kalshi.positionSummary.totalUnrealizedPnl.toFixed(2)}
                  </div>
                  <div className={`text-xs font-mono ${
                    liveData.kalshi.positionSummary.totalPnlPercent >= 0
                      ? "text-emerald-400/70"
                      : "text-red-400/70"
                  }`}>
                    {liveData.kalshi.positionSummary.totalPnlPercent >= 0 ? "+" : ""}
                    {liveData.kalshi.positionSummary.totalPnlPercent.toFixed(1)}% total return
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Position Cards */}
            <div className="space-y-3">
              {liveData.kalshi.positions.map((pos, i) => {
                const isProfit = (pos.unrealized_pnl || 0) >= 0;
                const isLong = (pos.position || 0) > 0;
                // Extract threshold from ticker (e.g., "KXSNOWSTORM-26FEBNYC2-10.0" -> "10")
                const thresholdMatch = pos.ticker?.match(/-(\d+(?:\.\d+)?)$/);
                const threshold = thresholdMatch ? thresholdMatch[1] : pos.ticker;

                return (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border ${
                      isProfit
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={isLong
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : "bg-red-500/20 text-red-400 border-red-500/40"
                            }
                          >
                            {isLong ? "YES" : "NO"} × {Math.abs(pos.position || 0)}
                          </Badge>
                          <span className="font-semibold text-lg">
                            Above {threshold}" of snow
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Entry:</span>
                            <span className="font-mono">${pos.average_price.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Current:</span>
                            <span className="font-mono">${(pos.currentPrice || 0).toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Cost:</span>
                            <span className="font-mono">${(pos.total_cost || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Value:</span>
                            <span className="font-mono">${(pos.current_value || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold font-mono ${
                          isProfit ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {isProfit ? "+" : ""}${(pos.unrealized_pnl || 0).toFixed(2)}
                        </div>
                        <div className={`text-sm font-mono ${
                          isProfit ? "text-emerald-400/70" : "text-red-400/70"
                        }`}>
                          {isProfit ? "+" : ""}{(pos.pnl_percent || 0).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {isProfit ? "▲" : "▼"} {Math.abs(((pos.currentPrice || 0) - pos.average_price) * 100).toFixed(1)}¢ per share
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary Row */}
            {liveData.kalshi.positionSummary && (
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Total Investment:</span>{" "}
                  ${liveData.kalshi.positionSummary.totalCost.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Current Value:</span>{" "}
                  ${liveData.kalshi.positionSummary.totalCurrentValue.toFixed(2)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Opportunities */}
      {opportunities.length > 0 && (
        <Card className="bg-card border-border border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Edge Opportunities
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Markets where model diverges from market by {">"}3%
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {opportunities.slice(0, 5).map((edge, i) => (
              <OpportunityCard key={i} edge={edge} rank={i + 1} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Kalshi Analysis */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-400" />
                {liveData?.kalshi?.eventTitle || "Kalshi Over/Under"}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {liveData?.kalshi?.eventTicker || "KXSNOWSTORM-26FEBNYC2"} •{" "}
                {liveData?.kalshi?.marketsFound || 0} markets
                {totalKalshiPositions > 0 && (
                  <span className="text-emerald-400 ml-2">
                    • {totalKalshiPositions} positions
                  </span>
                )}
              </p>
            </div>
            <a
              href="https://kalshi.com/markets/kxsnowstorm/snowstorms/KXSNOWSTORM-26FEBNYC2"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Open Kalshi <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {/* Auth Status Alert */}
          {liveData?.kalshi?.authStatus && !liveData.kalshi.authStatus.authenticated && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Position tracking unavailable</span>
              </div>
              <p className="text-xs text-amber-400/70 mt-1">
                {liveData.kalshi.authStatus.error || "API authentication failed"}
                {liveData.kalshi.authStatus.error?.includes("signature") && (
                  <span className="block mt-1">
                    Generate a new API key at{" "}
                    <a href="https://kalshi.com/settings/api" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">
                      kalshi.com/settings/api
                    </a>
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-2 font-medium">Strike</th>
                  <th className="text-center py-2 px-1 font-medium">
                    <span className="text-emerald-400">YES</span>
                    <span className="text-muted-foreground/50 mx-1">bid/ask</span>
                  </th>
                  <th className="text-center py-2 px-1 font-medium">
                    <span className="text-red-400">NO</span>
                    <span className="text-muted-foreground/50 mx-1">bid/ask</span>
                  </th>
                  <th className="text-center py-2 px-1 font-medium">Spread</th>
                  <th className="text-right py-2 px-2 font-medium">Model</th>
                  <th className="text-right py-2 px-2 font-medium">Edge</th>
                  <th className="text-right py-2 pl-2 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {liveData?.kalshi?.markets && liveData.kalshi.markets.length > 0
                  ? liveData.kalshi.markets.map((market) => {
                      const position = liveData.kalshi.positions?.find(
                        (p) => p.ticker === market.ticker
                      );
                      return (
                        <KalshiMarketRow
                          key={market.ticker}
                          market={market}
                          edge={kalshiEdges.find((e) =>
                            e.market.includes(market.title.replace(/[^0-9.]/g, ""))
                          )}
                          position={position}
                        />
                      );
                    })
                  : kalshiEdges.map((edge) => (
                      <tr
                        key={edge.market}
                        className={`border-b border-border/50 ${
                          edge.direction !== "NO_EDGE" ? "bg-muted/30" : ""
                        }`}
                      >
                        <td className="py-2 pr-2 font-medium">{edge.market}</td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-400/70">
                          {formatProb(edge.marketProb)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-red-400/70">
                          {formatProb(1 - (edge.marketProb || 0))}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatProb(edge.modelProb)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span
                            className={`font-mono ${
                              getEdgePct(edge) > 5
                                ? "text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            +{getEdgePct(edge).toFixed(1)}% {getEdgeLabel(edge)}
                          </span>
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <SignalBadge direction={edge.direction} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Polymarket Analysis */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-purple-400" />
                {liveData?.polymarket?.eventTitle || "Polymarket Ranges"}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {liveData?.polymarket?.marketsFound || 0} markets
                {liveData?.polymarket?.eventEndDate && (
                  <span> • Ends {formatTime(liveData.polymarket.eventEndDate)}</span>
                )}
                {totalPolymarketPositions > 0 && (
                  <span className="text-emerald-400 ml-2">
                    • {totalPolymarketPositions} positions
                  </span>
                )}
              </p>
            </div>
            <a
              href="https://polymarket.com/event/how-many-inches-of-snow-in-nyc-this-weekend-february-21-23-273"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Open Polymarket <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {/* Positions Section */}
          {liveData?.polymarket?.positions && liveData.polymarket.positions.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-purple-400">
                <Wallet className="w-4 h-4" />
                Your Positions
              </div>
              <div className="space-y-1">
                {liveData.polymarket.positions.map((pos, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>{pos.market_question || pos.market_id}</span>
                    <span className={pos.outcome === "Yes" ? "text-emerald-400" : "text-red-400"}>
                      {pos.outcome} × {pos.size?.toFixed(2)} @ {formatPrice(pos.average_price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-2 font-medium">Range</th>
                  <th className="text-center py-2 px-1 font-medium">
                    <span className="text-emerald-400">YES</span>
                    <span className="text-muted-foreground/50 mx-1">price</span>
                  </th>
                  <th className="text-center py-2 px-1 font-medium">
                    <span className="text-red-400">NO</span>
                    <span className="text-muted-foreground/50 mx-1">price</span>
                  </th>
                  <th className="text-right py-2 px-2 font-medium">Model</th>
                  <th className="text-right py-2 px-2 font-medium">Edge</th>
                  <th className="text-right py-2 px-1 font-medium">Vol</th>
                  <th className="text-right py-2 pl-1 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {liveData?.polymarket?.markets && liveData.polymarket.markets.length > 0
                  ? liveData.polymarket.markets.map((market) => (
                      <PolymarketMarketRow
                        key={market.id}
                        market={market}
                        edge={polymarketEdges.find((e) =>
                          market.question.toLowerCase().includes(e.market.toLowerCase().replace(/[<>+"]/g, ""))
                        )}
                      />
                    ))
                  : polymarketEdges.map((edge) => (
                      <tr
                        key={edge.market}
                        className={`border-b border-border/50 ${
                          edge.direction !== "NO_EDGE" ? "bg-muted/30" : ""
                        }`}
                      >
                        <td className="py-2 pr-2 font-medium">{edge.market}</td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-400/70">
                          {formatProb(edge.marketProb)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-red-400/70">
                          {formatProb(1 - (edge.marketProb || 0))}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatProb(edge.modelProb)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span
                            className={`font-mono ${
                              getEdgePct(edge) > 5
                                ? "text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            +{getEdgePct(edge).toFixed(1)}% {getEdgeLabel(edge)}
                          </span>
                        </td>
                        <td className="py-2 px-1 text-right text-xs text-muted-foreground">
                          {edge.volume ? `$${(edge.volume / 1000).toFixed(0)}k` : "—"}
                        </td>
                        <td className="py-2 pl-1 text-right">
                          <SignalBadge direction={edge.direction} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend/Disclaimer */}
      <div className="text-xs text-muted-foreground space-y-1 px-1">
        <p>
          <span className="text-emerald-400">BUY YES</span> = Model says more
          likely than market price |{" "}
          <span className="text-red-400">BUY NO</span> = Model says less likely
        </p>
        <p>
          Edge = Model Fair Value - Market Price | Kelly % = Optimal position
          size (fractional)
        </p>
        <p className="text-muted-foreground/70">
          Auto-refreshes every 30 seconds. Not financial advice.
        </p>
      </div>
    </div>
  );
}

// Kalshi market row with YES/NO orderbook display
function KalshiMarketRow({
  market,
  edge,
  position,
}: {
  market: KalshiMarket;
  edge?: EdgeAnalysis;
  position?: Position;
}) {
  const edgePct = edge ? getEdgePct(edge) : 0;
  const hasEdge = edge && edge.direction !== "NO_EDGE";
  const hasPosition = position && position.position !== 0;
  const isLong = hasPosition && (position.position || 0) > 0;
  const pnl = position?.unrealized_pnl || 0;
  const isProfit = pnl >= 0;

  return (
    <tr className={`border-b border-border/50 ${hasPosition ? "bg-emerald-500/5" : hasEdge ? "bg-muted/30" : ""}`}>
      <td className="py-3 pr-2">
        <div className="flex items-center gap-2">
          <div className="font-medium text-sm">{market.title}</div>
          {hasPosition && (
            <Badge
              variant="outline"
              className={isLong
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] px-1.5 py-0"
                : "bg-red-500/20 text-red-400 border-red-500/40 text-[10px] px-1.5 py-0"
              }
            >
              {isLong ? "YES" : "NO"} ×{Math.abs(position.position || 0)}
            </Badge>
          )}
        </div>
        {hasPosition && (
          <div className="flex items-center gap-3 mt-1 text-[10px]">
            <span className="text-muted-foreground">
              Entry: <span className="font-mono">${position.average_price.toFixed(2)}</span>
            </span>
            <span className={isProfit ? "text-emerald-400" : "text-red-400"}>
              P&L: <span className="font-mono font-semibold">{isProfit ? "+" : ""}${pnl.toFixed(2)}</span>
              <span className="ml-1">({isProfit ? "+" : ""}{(position.pnl_percent || 0).toFixed(1)}%)</span>
            </span>
          </div>
        )}
      </td>
      {/* YES Orderbook */}
      <td className="py-3 px-1">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">YES</span>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-emerald-400/70 font-mono">{formatPrice(market.yes.bid)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-emerald-400 font-mono font-semibold">{formatPrice(market.yes.ask)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {(market.yes.mid * 100).toFixed(0)}%
          </div>
        </div>
      </td>
      {/* NO Orderbook */}
      <td className="py-3 px-1">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">NO</span>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-red-400/70 font-mono">{formatPrice(market.no.bid)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-400 font-mono font-semibold">{formatPrice(market.no.ask)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {(market.no.mid * 100).toFixed(0)}%
          </div>
        </div>
      </td>
      {/* Spread */}
      <td className="py-3 px-1 text-center">
        <div className="text-[10px] text-muted-foreground">spread</div>
        <div className="text-xs font-mono text-muted-foreground">
          {((market.yes.ask - market.yes.bid) * 100).toFixed(0)}¢
        </div>
      </td>
      {/* Model */}
      <td className="py-3 px-2 text-right">
        <div className="text-[10px] text-muted-foreground">model</div>
        <div className="font-mono text-sm">
          {edge ? formatProb(edge.modelProb) : "—"}
        </div>
      </td>
      {/* Edge */}
      <td className="py-3 px-2 text-right">
        <div className="text-[10px] text-muted-foreground">edge</div>
        <span
          className={`font-mono text-sm font-semibold ${
            edgePct > 5
              ? "text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          +{edgePct.toFixed(1)}% {edge ? getEdgeLabel(edge) : ""}
        </span>
      </td>
      {/* Signal */}
      <td className="py-3 pl-2 text-right">
        {edge ? <SignalBadge direction={edge.direction} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

// Polymarket market row with YES/NO orderbook display
function PolymarketMarketRow({
  market,
  edge,
}: {
  market: PolymarketMarket;
  edge?: EdgeAnalysis;
}) {
  const edgePct = edge ? getEdgePct(edge) : 0;
  const hasEdge = edge && edge.direction !== "NO_EDGE";

  // Extract range from question
  const rangeMatch = market.question.match(/(\d+[-–]\d+|\d+\+|<\d+|under \d+)/i);
  const range = market.groupItemTitle || rangeMatch?.[0] || market.question.substring(0, 20);

  return (
    <tr className={`border-b border-border/50 ${hasEdge ? "bg-muted/30" : ""}`}>
      <td className="py-3 pr-2">
        <div className="font-medium text-sm">{range}"</div>
      </td>
      {/* YES Price */}
      <td className="py-3 px-1">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">YES</span>
          <div className="text-sm font-mono font-semibold text-emerald-400">
            {(market.yes.price * 100).toFixed(0)}¢
          </div>
        </div>
      </td>
      {/* NO Price */}
      <td className="py-3 px-1">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">NO</span>
          <div className="text-sm font-mono font-semibold text-red-400">
            {(market.no.price * 100).toFixed(0)}¢
          </div>
        </div>
      </td>
      {/* Model */}
      <td className="py-3 px-2 text-right">
        <div className="text-[10px] text-muted-foreground">model</div>
        <div className="font-mono text-sm">
          {edge ? formatProb(edge.modelProb) : "—"}
        </div>
      </td>
      {/* Edge */}
      <td className="py-3 px-2 text-right">
        <div className="text-[10px] text-muted-foreground">edge</div>
        <span
          className={`font-mono text-sm font-semibold ${
            edgePct > 5
              ? "text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          +{edgePct.toFixed(1)}% {edge ? getEdgeLabel(edge) : ""}
        </span>
      </td>
      {/* Volume */}
      <td className="py-3 px-1 text-right">
        <div className="text-[10px] text-muted-foreground">vol</div>
        <div className="text-xs text-muted-foreground">
          {market.volume > 0 ? `$${(market.volume / 1000).toFixed(0)}k` : "—"}
        </div>
      </td>
      {/* Signal */}
      <td className="py-3 pl-1 text-right">
        {edge ? <SignalBadge direction={edge.direction} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

function OpportunityCard({ edge, rank }: { edge: EdgeAnalysis; rank: number }) {
  const isYes = edge.direction === "BUY_YES";
  const color = isYes ? "emerald" : "red";
  const Icon = isYes ? TrendingUp : TrendingDown;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${
        isYes
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-red-500/5 border-red-500/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            isYes ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
          }`}
        >
          {rank}
        </div>
        <Icon className={`w-5 h-5 text-${color}-400`} />
        <div>
          <div className="font-medium flex items-center gap-2">
            {edge.market}
            <Badge
              variant="outline"
              className={
                edge.source === "kalshi"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs"
                  : "bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs"
              }
            >
              {edge.source}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Model: {formatProb(edge.modelProb)} | Market:{" "}
            {formatProb(edge.marketProb)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono font-bold text-lg text-emerald-400">
          +{getEdgePct(edge).toFixed(1)}% {getEdgeLabel(edge)}
        </div>
        <div className="text-xs text-muted-foreground">
          Kelly: {getKellyPct(edge).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function SignalBadge({
  direction,
}: {
  direction: "BUY_YES" | "BUY_NO" | "NO_EDGE";
}) {
  if (direction === "NO_EDGE") {
    return (
      <span className="text-xs text-muted-foreground">—</span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={
        direction === "BUY_YES"
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
          : "bg-red-500/10 text-red-400 border-red-500/30 text-xs"
      }
    >
      {direction === "BUY_YES" ? "YES" : "NO"}
    </Badge>
  );
}
