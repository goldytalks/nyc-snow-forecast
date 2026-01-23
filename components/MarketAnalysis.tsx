"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ExternalLink,
  Target,
} from "lucide-react";
import {
  calculateAllEdges,
  getBestOpportunities,
  calculateRangeProbabilities,
  KALSHI_PRICES,
  POLYMARKET_PRICES,
  type EdgeAnalysis,
} from "@/lib/markets/manual-prices";

interface MarketAnalysisProps {
  strikeProbabilities: Record<string, number>;
}

export function MarketAnalysis({ strikeProbabilities }: MarketAnalysisProps) {
  const edges = useMemo(
    () => calculateAllEdges(strikeProbabilities),
    [strikeProbabilities]
  );

  const opportunities = useMemo(() => getBestOpportunities(edges), [edges]);

  const kalshiEdges = edges.filter((e) => e.source === "kalshi");
  const polymarketEdges = edges.filter((e) => e.source === "polymarket");

  const rangeProbabilities = useMemo(
    () => calculateRangeProbabilities(strikeProbabilities),
    [strikeProbabilities]
  );

  return (
    <div className="space-y-6">
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
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              Kalshi Over/Under
            </CardTitle>
            <a
              href="https://kalshi.com/markets/weather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Open Kalshi <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-2">Strike</th>
                  <th className="text-right py-2 px-2">Model</th>
                  <th className="text-right py-2 px-2">Market</th>
                  <th className="text-right py-2 px-2">Edge</th>
                  <th className="text-right py-2 pl-2">Signal</th>
                </tr>
              </thead>
              <tbody>
                {kalshiEdges.map((edge) => (
                  <tr
                    key={edge.market}
                    className={`border-b border-border/50 ${
                      edge.direction !== "NO_EDGE" ? "bg-muted/30" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium">{edge.market}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {(edge.modelProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                      {(edge.marketProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span
                        className={`font-mono ${
                          edge.edge > 0.05
                            ? "text-emerald-400"
                            : edge.edge < -0.05
                              ? "text-red-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {edge.edge >= 0 ? "+" : ""}
                        {edge.edgePct.toFixed(1)}%
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
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-purple-400" />
              Polymarket Ranges
            </CardTitle>
            <a
              href="https://polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Open Polymarket <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-2">Range</th>
                  <th className="text-right py-2 px-2">Model</th>
                  <th className="text-right py-2 px-2">Market</th>
                  <th className="text-right py-2 px-2">Edge</th>
                  <th className="text-right py-2 px-1">Vol</th>
                  <th className="text-right py-2 pl-1">Signal</th>
                </tr>
              </thead>
              <tbody>
                {polymarketEdges.map((edge) => (
                  <tr
                    key={edge.market}
                    className={`border-b border-border/50 ${
                      edge.direction !== "NO_EDGE" ? "bg-muted/30" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium">{edge.market}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {(edge.modelProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                      {(edge.marketProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span
                        className={`font-mono ${
                          edge.edge > 0.05
                            ? "text-emerald-400"
                            : edge.edge < -0.05
                              ? "text-red-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {edge.edge >= 0 ? "+" : ""}
                        {edge.edgePct.toFixed(1)}%
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
          Market prices are estimates. Update lib/markets/manual-prices.ts with
          current prices. Not financial advice.
        </p>
      </div>
    </div>
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
            Model: {(edge.modelProb * 100).toFixed(0)}% | Market:{" "}
            {(edge.marketProb * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono font-bold text-lg text-${color}-400`}>
          {isYes ? "+" : ""}
          {edge.edgePct.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground">
          Kelly: {edge.kellyPct.toFixed(1)}%
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
