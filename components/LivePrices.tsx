"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Zap } from "lucide-react";

interface MarketPrice {
  ticker: string;
  threshold: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume_24h: number;
}

interface StreamData {
  type: string;
  timestamp: string;
  prices: MarketPrice[];
  balance: { available: number; payout: number } | null;
  positions: Array<{
    ticker: string;
    position: number;
    avgPrice: number;
    exposure: number;
  }>;
  authWorking: boolean;
}

export function LivePrices() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [positions, setPositions] = useState<any[]>([]);
  const [balance, setBalance] = useState<{ available: number; payout: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const prevPricesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Connect to SSE stream
    const eventSource = new EventSource("/api/kalshi-stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: StreamData = JSON.parse(event.data);

        if (data.prices && data.prices.length > 0) {
          setPrices(data.prices);
          setLastUpdate(new Date(data.timestamp));
        }

        if (data.balance) {
          setBalance(data.balance);
        }

        if (data.positions) {
          setPositions(data.positions);
        }
      } catch (e) {
        console.error("Failed to parse SSE data:", e);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(() => {
        eventSource.close();
        // Will reconnect on next render
      }, 3000);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Track price changes for animation
  const getPriceChange = (ticker: string, currentPrice: number): "up" | "down" | "same" => {
    const prevPrice = prevPricesRef.current.get(ticker);
    if (prevPrice === undefined) {
      prevPricesRef.current.set(ticker, currentPrice);
      return "same";
    }
    if (currentPrice > prevPrice) {
      prevPricesRef.current.set(ticker, currentPrice);
      return "up";
    }
    if (currentPrice < prevPrice) {
      prevPricesRef.current.set(ticker, currentPrice);
      return "down";
    }
    return "same";
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Only show active markets (not bonded at 99)
  const activeMarkets = prices.filter(
    (p) => p.yes_bid < 95 && p.threshold >= 8
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${connected ? "text-emerald-400" : "text-red-400"}`} />
            Live Kalshi Prices
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-xs">
                <Activity className="w-3 h-3 mr-1 animate-pulse" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-400 border-red-500/40 text-xs">
                DISCONNECTED
              </Badge>
            )}
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                {formatTime(lastUpdate)}
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {prices.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            Connecting to Kalshi...
          </div>
        ) : (
          <div className="space-y-2">
            {/* Active Markets Table */}
            <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b border-border">
              <div>Strike</div>
              <div className="text-right">YES Bid</div>
              <div className="text-right">YES Ask</div>
              <div className="text-right">NO Bid</div>
              <div className="text-right">NO Ask</div>
            </div>

            {activeMarkets.map((market) => {
              const yesMid = (market.yes_bid + market.yes_ask) / 2;
              const change = getPriceChange(market.ticker, yesMid);
              const position = positions.find((p) =>
                p.ticker.includes(`-${market.threshold}`)
              );

              return (
                <div
                  key={market.ticker}
                  className={`grid grid-cols-5 gap-2 text-sm py-1 ${
                    change === "up"
                      ? "bg-emerald-500/10"
                      : change === "down"
                      ? "bg-red-500/10"
                      : ""
                  } rounded transition-colors`}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-medium">&gt;{market.threshold}"</span>
                    {position && (
                      <Badge
                        variant="outline"
                        className={`text-xs px-1 ${
                          position.position < 0
                            ? "text-red-400 border-red-500/40"
                            : "text-emerald-400 border-emerald-500/40"
                        }`}
                      >
                        {position.position < 0 ? "NO" : "YES"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right font-mono text-emerald-400">
                    {market.yes_bid}c
                  </div>
                  <div className="text-right font-mono text-emerald-400">
                    {market.yes_ask}c
                  </div>
                  <div className="text-right font-mono text-red-400">
                    {market.no_bid}c
                  </div>
                  <div className="text-right font-mono text-red-400">
                    {market.no_ask}c
                  </div>
                </div>
              );
            })}

            {/* Position P&L */}
            {positions.length > 0 && (
              <div className="pt-2 mt-2 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Your Positions
                </div>
                {positions.map((pos) => {
                  const market = prices.find((p) => p.ticker === pos.ticker);
                  if (!market) return null;

                  const isNo = pos.position < 0;
                  const currentPrice = isNo
                    ? market.no_bid // Can sell at NO bid
                    : market.yes_bid;
                  const pnl = (currentPrice / 100 - pos.avgPrice) * Math.abs(pos.position);
                  const pnlPct = ((currentPrice / 100 - pos.avgPrice) / pos.avgPrice) * 100;

                  return (
                    <div
                      key={pos.ticker}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            isNo
                              ? "text-red-400 border-red-500/40"
                              : "text-emerald-400 border-emerald-500/40"
                          }
                        >
                          {isNo ? "NO" : "YES"}
                        </Badge>
                        <span>&gt;{market.threshold}"</span>
                        <span className="text-muted-foreground">
                          ×{Math.abs(pos.position)} @ {(pos.avgPrice * 100).toFixed(0)}c
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          Now: {currentPrice}c
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            pnl >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                          <span className="text-xs ml-1">
                            ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Balance */}
            {balance && (
              <div className="pt-2 mt-2 border-t border-border flex justify-between text-sm">
                <span className="text-muted-foreground">Available Balance:</span>
                <span className="font-mono font-bold text-emerald-400">
                  ${balance.available.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
