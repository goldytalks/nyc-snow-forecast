"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  calculateEdge,
  getSignificantEdges,
  formatEdge,
  getDefaultMarketPrices,
  type EdgeAnalysis as EdgeAnalysisType,
} from "@/lib/comparison/edge-calculator";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

interface EdgeAnalysisProps {
  strikeProbabilities: Record<string, number>;
}

export function EdgeAnalysis({ strikeProbabilities }: EdgeAnalysisProps) {
  // Get market prices (in production, this would be fetched)
  const marketPrices = getDefaultMarketPrices();

  // Calculate edges
  const allEdges = calculateEdge(strikeProbabilities, marketPrices);
  const significantEdges = getSignificantEdges(allEdges);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Model vs Market
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Comparing independent model probabilities to market prices
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Significant Edges */}
        {significantEdges.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Edge Opportunities
            </div>
            <div className="space-y-2">
              {significantEdges.slice(0, 3).map((edge) => (
                <EdgeCard key={edge.threshold} edge={edge} />
              ))}
            </div>
          </div>
        )}

        {significantEdges.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4">
            No significant edges detected ({">"}5% difference)
          </div>
        )}

        {/* Full Comparison Table */}
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">All Thresholds</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-2">{">"}</th>
                  <th className="text-right py-2 px-2">Model</th>
                  <th className="text-right py-2 px-2">Market</th>
                  <th className="text-right py-2 pl-2">Edge</th>
                </tr>
              </thead>
              <tbody>
                {allEdges.map((edge) => (
                  <tr
                    key={edge.threshold}
                    className="border-b border-border/50 hover:bg-muted/50"
                  >
                    <td className="py-1.5 pr-2 font-medium">{edge.threshold}"</td>
                    <td className="py-1.5 px-2 text-right">
                      {(edge.modelProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">
                      {(edge.marketProb * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <span
                        className={
                          edge.edge > 0.05
                            ? "text-emerald-400"
                            : edge.edge < -0.05
                              ? "text-red-400"
                              : "text-muted-foreground"
                        }
                      >
                        {formatEdge(edge.edge)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
          Market prices are examples only. Model is independent of market data.
          Not financial advice.
        </div>
      </CardContent>
    </Card>
  );
}

function EdgeCard({ edge }: { edge: EdgeAnalysisType }) {
  const DirectionIcon =
    edge.direction === "BUY_YES"
      ? TrendingUp
      : edge.direction === "BUY_NO"
        ? TrendingDown
        : Minus;

  const directionColor =
    edge.direction === "BUY_YES"
      ? "text-emerald-400"
      : edge.direction === "BUY_NO"
        ? "text-red-400"
        : "text-muted-foreground";

  const confidenceColor =
    edge.confidence === "HIGH"
      ? "bg-emerald-500/20 text-emerald-400"
      : edge.confidence === "MEDIUM"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className="flex items-center gap-3">
        <DirectionIcon className={`w-5 h-5 ${directionColor}`} />
        <div>
          <div className="font-medium">
            {">"}{edge.threshold}" Snow
          </div>
          <div className="text-xs text-muted-foreground">
            Model: {(edge.modelProb * 100).toFixed(0)}% vs Market:{" "}
            {(edge.marketProb * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={confidenceColor}>
          {edge.confidence}
        </Badge>
        <span className={`font-mono font-bold ${directionColor}`}>
          {formatEdge(edge.edge)}
        </span>
      </div>
    </div>
  );
}
