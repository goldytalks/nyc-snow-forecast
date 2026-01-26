"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Zap, Wallet, TrendingUp, TrendingDown } from "lucide-react";

interface KalshiPrice {
  ticker: string;
  threshold: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
}

interface PolymarketPrice {
  id: string;
  question: string;
  range: string;
  yes_price: number;
  no_price: number;
}

interface PolymarketPosition {
  conditionId: string;
  outcomeIndex: number;
  size: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  range: string;
  isYes: boolean;
}

interface Position {
  ticker: string;
  position: number;
  avgPrice: number;
  exposure: number;
}

interface StreamData {
  type: string;
  timestamp: string;
  kalshi: {
    prices: KalshiPrice[];
    positions: Position[];
  };
  polymarket: {
    prices: PolymarketPrice[];
    positions?: PolymarketPosition[];
  };
  balance: { available: number; portfolioValue: number } | null;
  authWorking: boolean;
}

export function LivePrices() {
  const [kalshiPrices, setKalshiPrices] = useState<KalshiPrice[]>([]);
  const [polymarketPrices, setPolymarketPrices] = useState<PolymarketPrice[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [polyPositions, setPolyPositions] = useState<PolymarketPosition[]>([]);
  const [balance, setBalance] = useState<{ available: number; portfolioValue: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [authWorking, setAuthWorking] = useState(false);
  const prevKalshiRef = useRef<Map<number, number>>(new Map());
  const prevPolyRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const eventSource = new EventSource("/api/kalshi-stream");

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (event) => {
      try {
        const data: StreamData = JSON.parse(event.data);

        if (data.kalshi?.prices) {
          setKalshiPrices(data.kalshi.prices);
        }
        if (data.kalshi?.positions) {
          setPositions(data.kalshi.positions);
        }
        if (data.polymarket?.prices) {
          setPolymarketPrices(data.polymarket.prices);
        }
        if (data.polymarket?.positions) {
          setPolyPositions(data.polymarket.positions);
        }
        if (data.balance) {
          setBalance(data.balance);
        }
        if (data.authWorking !== undefined) {
          setAuthWorking(data.authWorking);
        }
        if (data.timestamp) {
          setLastUpdate(new Date(data.timestamp));
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setTimeout(() => eventSource.close(), 3000);
    };

    return () => eventSource.close();
  }, []);

  const getKalshiChange = (threshold: number, price: number): "up" | "down" | "same" => {
    const prev = prevKalshiRef.current.get(threshold);
    prevKalshiRef.current.set(threshold, price);
    if (prev === undefined) return "same";
    if (price > prev) return "up";
    if (price < prev) return "down";
    return "same";
  };

  const getPolyChange = (range: string, price: number): "up" | "down" | "same" => {
    const prev = prevPolyRef.current.get(range);
    prevPolyRef.current.set(range, price);
    if (prev === undefined) return "same";
    if (price > prev) return "up";
    if (price < prev) return "down";
    return "same";
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

  // Filter to show only active Kalshi markets (not bonded)
  const activeKalshi = kalshiPrices.filter((p) => p.yes_bid < 95 && p.threshold >= 8);

  // Calculate P&L for positions
  const calculatePnL = (pos: Position) => {
    const market = kalshiPrices.find((p) => p.ticker === pos.ticker);
    if (!market) return { pnl: 0, pnlPct: 0, currentPrice: 0 };

    const isNo = pos.position < 0;
    const currentPrice = isNo ? market.no_bid : market.yes_bid;
    const pnl = (currentPrice / 100 - pos.avgPrice) * Math.abs(pos.position);
    const pnlPct = pos.avgPrice > 0 ? ((currentPrice / 100 - pos.avgPrice) / pos.avgPrice) * 100 : 0;

    return { pnl, pnlPct, currentPrice };
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${connected ? "text-emerald-400" : "text-red-400"}`} />
            Live Market Prices
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-xs">
                <Activity className="w-3 h-3 mr-1 animate-pulse" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-400 border-red-500/40 text-xs">
                OFFLINE
              </Badge>
            )}
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">{formatTime(lastUpdate)}</span>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Balance */}
        {authWorking && balance && (
          <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-muted-foreground">Available</span>
            </div>
            <span className="font-mono font-bold text-emerald-400">
              ${balance.available.toFixed(2)}
            </span>
          </div>
        )}

        {/* Kalshi Prices */}
        {activeKalshi.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">KALSHI</span>
              Strike Prices
            </div>
            <div className="grid grid-cols-5 gap-1 text-[10px] font-medium text-muted-foreground pb-1 border-b border-border">
              <div>Strike</div>
              <div className="text-right">YES Bid</div>
              <div className="text-right">YES Ask</div>
              <div className="text-right">NO Bid</div>
              <div className="text-right">NO Ask</div>
            </div>
            <div className="space-y-0.5 mt-1">
              {activeKalshi.map((m) => {
                const yesMid = (m.yes_bid + m.yes_ask) / 2;
                const change = getKalshiChange(m.threshold, yesMid);
                const pos = positions.find((p) => p.ticker === m.ticker);

                return (
                  <div
                    key={m.ticker}
                    className={`grid grid-cols-5 gap-1 text-xs py-0.5 rounded transition-colors ${
                      change === "up" ? "bg-emerald-500/10" : change === "down" ? "bg-red-500/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-medium">&gt;{m.threshold}"</span>
                      {pos && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1 py-0 ${
                            pos.position < 0
                              ? "text-red-400 border-red-500/40"
                              : "text-emerald-400 border-emerald-500/40"
                          }`}
                        >
                          {pos.position < 0 ? "NO" : "YES"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right font-mono text-emerald-400">{m.yes_bid}c</div>
                    <div className="text-right font-mono text-emerald-400">{m.yes_ask}c</div>
                    <div className="text-right font-mono text-red-400">{m.no_bid}c</div>
                    <div className="text-right font-mono text-red-400">{m.no_ask}c</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Polymarket Prices */}
        {polymarketPrices.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px]">POLYMARKET</span>
              Range Prices
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px] font-medium text-muted-foreground pb-1 border-b border-border">
              <div>Range</div>
              <div className="text-right">YES</div>
              <div className="text-right">NO</div>
            </div>
            <div className="space-y-0.5 mt-1">
              {polymarketPrices.map((m) => {
                const change = getPolyChange(m.range, m.yes_price);
                return (
                  <div
                    key={m.id}
                    className={`grid grid-cols-3 gap-1 text-xs py-0.5 rounded transition-colors ${
                      change === "up" ? "bg-emerald-500/10" : change === "down" ? "bg-red-500/10" : ""
                    }`}
                  >
                    <div className="font-medium">{m.range}"</div>
                    <div className="text-right font-mono text-emerald-400">
                      {(m.yes_price * 100).toFixed(0)}c
                    </div>
                    <div className="text-right font-mono text-red-400">
                      {(m.no_price * 100).toFixed(0)}c
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Polymarket Positions */}
        {polyPositions.length > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px]">POLYMARKET</span>
              Your Positions
            </div>
            {polyPositions.map((pos) => (
              <div key={pos.conditionId} className="flex items-center justify-between text-sm py-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      pos.isYes ? "text-emerald-400 border-emerald-500/40" : "text-red-400 border-red-500/40"
                    }
                  >
                    {pos.isYes ? "YES" : "NO"}
                  </Badge>
                  <span>{pos.range}"</span>
                  <span className="text-muted-foreground text-xs">
                    ×{pos.size.toFixed(0)} @ {(pos.avgPrice * 100).toFixed(0)}c
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Now: {(pos.currentPrice * 100).toFixed(0)}c</span>
                  <span
                    className={`font-mono font-bold flex items-center gap-1 ${
                      pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {pos.pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                    <span className="text-[10px]">({pos.pnlPercent >= 0 ? "+" : ""}{pos.pnlPercent.toFixed(0)}%)</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Kalshi Positions with P&L */}
        {positions.length > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">KALSHI</span>
              Your Positions
            </div>
            {positions.map((pos) => {
              const { pnl, pnlPct, currentPrice } = calculatePnL(pos);
              const threshold = pos.ticker.match(/-(\d+(?:\.\d+)?)$/)?.[1];
              const isNo = pos.position < 0;

              return (
                <div key={pos.ticker} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        isNo ? "text-red-400 border-red-500/40" : "text-emerald-400 border-emerald-500/40"
                      }
                    >
                      {isNo ? "NO" : "YES"}
                    </Badge>
                    <span>&gt;{threshold}"</span>
                    <span className="text-muted-foreground text-xs">
                      ×{Math.abs(pos.position)} @ {(pos.avgPrice * 100).toFixed(0)}c
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Now: {currentPrice}c</span>
                    <span
                      className={`font-mono font-bold flex items-center gap-1 ${
                        pnl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      <span className="text-[10px]">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(0)}%)</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {kalshiPrices.length === 0 && polymarketPrices.length === 0 && (
          <div className="text-center text-muted-foreground py-4">Connecting...</div>
        )}
      </CardContent>
    </Card>
  );
}
