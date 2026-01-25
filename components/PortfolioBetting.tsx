"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Target,
  RefreshCw,
  AlertTriangle,
  DollarSign,
} from "lucide-react";

interface Position {
  ticker: string;
  market_title: string;
  position: number;
  average_price: number;
  total_cost: number;
  current_value: number;
  unrealized_pnl: number;
  pnl_percent: number;
}

interface BetRecommendation {
  market: string;
  threshold: number;
  direction: "BUY_YES" | "BUY_NO";
  edge: number;
  modelProb: number;
  marketProb: number;
  kellyFraction: number;
  halfKelly: number;
  recommendedBet: number;
  contracts: number;
  entryPrice: number;
  sellTarget: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

interface PortfolioData {
  balance: {
    available: number;
    portfolioValue: number;
    total: number;
  };
  positions: Position[];
  positionSummary: {
    totalCost: number;
    totalUnrealizedPnl: number;
    totalCurrentValue: number;
    totalPnlPercent: number;
  };
  betSizing: BetRecommendation[];
  authStatus: { authenticated: boolean; error?: string };
}

export function PortfolioBetting() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/markets");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();

      setData({
        balance: json.kalshi?.balance || { available: 0, portfolioValue: 0, total: 0 },
        positions: json.kalshi?.positions || [],
        positionSummary: json.kalshi?.positionSummary || {
          totalCost: 0,
          totalUnrealizedPnl: 0,
          totalCurrentValue: 0,
          totalPnlPercent: 0,
        },
        betSizing: json.kalshi?.betSizing || [],
        authStatus: json.kalshi?.authStatus || { authenticated: false },
      });
      setError(null);
    } catch (e) {
      setError("Failed to load portfolio data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatPnL = (amount: number) => {
    const formatted = formatCurrency(Math.abs(amount));
    if (amount > 0) return `+${formatted}`;
    if (amount < 0) return `-${formatted}`;
    return formatted;
  };

  if (loading && !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="animate-pulse flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.authStatus?.authenticated) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-400" />
            Portfolio & Betting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Kalshi API not authenticated</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {data?.authStatus?.error || "Check API credentials in .env.local"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Kalshi Balance
            </div>
            <button
              onClick={fetchData}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Available</div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                {formatCurrency(data.balance.available)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">In Positions</div>
              <div className="text-xl font-bold font-mono">
                {formatCurrency(data.positionSummary.totalCurrentValue)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Unrealized P&L</div>
              <div
                className={`text-xl font-bold font-mono ${
                  data.positionSummary.totalUnrealizedPnl >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {formatPnL(data.positionSummary.totalUnrealizedPnl)}
              </div>
            </div>
          </div>

          {/* Active Positions */}
          {data.positions.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Active Positions
              </div>
              <div className="space-y-2">
                {data.positions.map((pos) => {
                  const threshold = pos.ticker.match(/-(\d+(?:\.\d+)?)$/)?.[1];
                  const isLongYes = pos.position > 0;
                  return (
                    <div
                      key={pos.ticker}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            isLongYes
                              ? "text-emerald-400 border-emerald-500/40"
                              : "text-red-400 border-red-500/40"
                          }
                        >
                          {isLongYes ? "YES" : "NO"}
                        </Badge>
                        <span>&gt;{threshold}"</span>
                        <span className="text-muted-foreground">
                          × {Math.abs(pos.position)}
                        </span>
                      </div>
                      <div
                        className={`font-mono ${
                          pos.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatPnL(pos.unrealized_pnl)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bet Recommendations */}
      {data.betSizing.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              Recommended Bets (Half-Kelly)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.betSizing.slice(0, 5).map((bet) => (
                <div
                  key={bet.market}
                  className="p-3 rounded-lg bg-muted/30 border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          bet.direction === "BUY_YES"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-red-500/20 text-red-400 border-red-500/40"
                        }
                      >
                        {bet.direction === "BUY_YES" ? "BUY YES" : "BUY NO"}
                      </Badge>
                      <span className="font-medium">{bet.market}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        bet.confidence === "HIGH"
                          ? "text-emerald-400 border-emerald-500/40"
                          : bet.confidence === "MEDIUM"
                          ? "text-yellow-400 border-yellow-500/40"
                          : "text-muted-foreground"
                      }
                    >
                      {bet.confidence}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Edge: </span>
                      <span className="text-emerald-400 font-mono">
                        +{bet.edge.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entry: </span>
                      <span className="font-mono">{bet.entryPrice}c</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sell at: </span>
                      <span className="font-mono text-blue-400">{bet.sellTarget}c</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Kelly: </span>
                      <span className="font-mono">{bet.halfKelly.toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-emerald-400">
                        {formatCurrency(bet.recommendedBet)}
                      </span>
                      <span className="text-muted-foreground">
                        ({bet.contracts} contracts)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Model: {bet.modelProb.toFixed(0)}% vs Market: {bet.marketProb.toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
              <p>
                <strong>Sell targets</strong> are set where edge erodes to ~3%.
                Half-Kelly sizing reduces variance while capturing most expected value.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
