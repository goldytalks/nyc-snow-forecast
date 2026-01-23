"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface MarketData {
  kalshi: {
    status: string;
    markets: Array<{
      ticker: string;
      threshold: number;
      direction: string;
      yesMid: number;
      yesBid: number;
      yesAsk: number;
      volume: number;
    }>;
  };
  polymarket: {
    status: string;
    markets: Array<{
      id: string;
      question: string;
      rangeType: string;
      rangeLow: number | null;
      rangeHigh: number | null;
      yesPrice: number;
      volume: number;
    }>;
  };
}

interface EdgeOpportunity {
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

interface MarketAPIResponse {
  timestamp: string;
  modelProbabilities: Record<string, number>;
  markets: MarketData;
  edges: EdgeOpportunity[];
  summary: {
    kalshiMarketsFound: number;
    polymarketMarketsFound: number;
    edgeOpportunities: number;
  };
}

interface EdgeAnalysisProps {
  strikeProbabilities: Record<string, number>;
}

export function EdgeAnalysis({ strikeProbabilities }: EdgeAnalysisProps) {
  const [marketData, setMarketData] = useState<MarketAPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchMarketData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/markets");
      if (!response.ok) throw new Error("Failed to fetch markets");
      const data = await response.json();
      setMarketData(data);
      setLastFetch(new Date());
    } catch (err) {
      setError((err as Error).message);
      // Use fallback comparison with model data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
    // Refresh every 2 minutes
    const interval = setInterval(fetchMarketData, 120000);
    return () => clearInterval(interval);
  }, []);

  // Build comparison table from available data
  const comparisonData = buildComparisonTable(strikeProbabilities, marketData);
  const edges = marketData?.edges || [];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Model vs Market
          </CardTitle>
          <button
            onClick={fetchMarketData}
            disabled={loading}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            title="Refresh market data"
          >
            <RefreshCw
              className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>Live market data from Kalshi & Polymarket</span>
          {lastFetch && (
            <span className="text-muted-foreground/70">
              (updated {lastFetch.toLocaleTimeString()})
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded">
            {error} - Using model-only comparison
          </div>
        )}

        {/* Edge Opportunities */}
        {edges.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Edge Opportunities ({edges.length})
            </div>
            <div className="space-y-2">
              {edges.slice(0, 4).map((edge, i) => (
                <EdgeCard key={i} edge={edge} />
              ))}
            </div>
          </div>
        )}

        {edges.length === 0 && !loading && (
          <div className="text-sm text-muted-foreground text-center py-2">
            {marketData?.markets.kalshi.markets.length === 0 &&
            marketData?.markets.polymarket.markets.length === 0
              ? "No live market data found - check API connections"
              : "No significant edges detected (>5% difference)"}
          </div>
        )}

        {/* Market Status */}
        <div className="flex gap-2 text-xs">
          <Badge
            variant="outline"
            className={
              marketData?.markets.kalshi.status === "success"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }
          >
            Kalshi: {marketData?.markets.kalshi.markets.length || 0} markets
          </Badge>
          <Badge
            variant="outline"
            className={
              marketData?.markets.polymarket.status === "success"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }
          >
            Polymarket: {marketData?.markets.polymarket.markets.length || 0}{" "}
            markets
          </Badge>
        </div>

        {/* Comparison Table */}
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Strike Comparison</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-2">Strike</th>
                  <th className="text-right py-2 px-2">Model</th>
                  <th className="text-right py-2 px-2">Kalshi</th>
                  <th className="text-right py-2 pl-2">Edge</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row) => (
                  <tr
                    key={row.threshold}
                    className="border-b border-border/50 hover:bg-muted/50"
                  >
                    <td className="py-1.5 pr-2 font-medium">{">"}{row.threshold}"</td>
                    <td className="py-1.5 px-2 text-right">
                      {(row.modelProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">
                      {row.kalshiProb !== null
                        ? `${(row.kalshiProb * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      {row.edge !== null ? (
                        <span
                          className={
                            row.edge > 0.05
                              ? "text-emerald-400"
                              : row.edge < -0.05
                                ? "text-red-400"
                                : "text-muted-foreground"
                          }
                        >
                          {row.edge >= 0 ? "+" : ""}
                          {(row.edge * 100).toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Links */}
        <div className="flex gap-3 text-xs pt-2 border-t border-border">
          <a
            href="https://kalshi.com/markets/snow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            Kalshi <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Disclaimer */}
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
          Model is independent of market data. Not financial advice.
        </div>
      </CardContent>
    </Card>
  );
}

function EdgeCard({ edge }: { edge: EdgeOpportunity }) {
  const DirectionIcon =
    edge.direction === "BUY_YES" ? TrendingUp : TrendingDown;

  const directionColor =
    edge.direction === "BUY_YES" ? "text-emerald-400" : "text-red-400";

  const confidenceColor =
    edge.confidence === "HIGH"
      ? "bg-emerald-500/20 text-emerald-400"
      : edge.confidence === "MEDIUM"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-muted text-muted-foreground";

  const sourceColor =
    edge.source === "kalshi"
      ? "bg-blue-500/20 text-blue-400"
      : "bg-purple-500/20 text-purple-400";

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className="flex items-center gap-3">
        <DirectionIcon className={`w-5 h-5 ${directionColor}`} />
        <div>
          <div className="font-medium text-sm">{edge.market}</div>
          <div className="text-xs text-muted-foreground">
            Model: {(edge.modelProb * 100).toFixed(0)}% vs Market:{" "}
            {(edge.marketProb * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={sourceColor}>
          {edge.source}
        </Badge>
        <Badge variant="outline" className={confidenceColor}>
          {edge.confidence}
        </Badge>
        <span className={`font-mono font-bold ${directionColor}`}>
          {edge.edge >= 0 ? "+" : ""}
          {(edge.edge * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function buildComparisonTable(
  modelProbs: Record<string, number>,
  marketData: MarketAPIResponse | null
): Array<{
  threshold: number;
  modelProb: number;
  kalshiProb: number | null;
  edge: number | null;
}> {
  const thresholds = [4, 6, 8, 10, 12, 15, 18, 20];

  return thresholds.map((threshold) => {
    const modelProb = modelProbs[threshold.toString()] || 0;

    // Find Kalshi market for this threshold
    const kalshiMarket = marketData?.markets.kalshi.markets.find(
      (m) => m.threshold === threshold && m.direction === "over"
    );

    const kalshiProb = kalshiMarket?.yesMid || null;
    const edge = kalshiProb !== null ? modelProb - kalshiProb : null;

    return {
      threshold,
      modelProb,
      kalshiProb,
      edge,
    };
  });
}
