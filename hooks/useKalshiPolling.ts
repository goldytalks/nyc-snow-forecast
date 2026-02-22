"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface KalshiMarketPrice {
  ticker: string;
  threshold: number | null;
  yesMid: number;
  yesBid: number;
  yesAsk: number;
  noMid: number;
  volume: number;
}

interface UseKalshiPollingReturn {
  markets: KalshiMarketPrice[];
  lastUpdate: Date | null;
  connected: boolean;
  error: string | null;
}

/**
 * Client-side hook for aggressive Kalshi price polling.
 * Kalshi WebSocket requires auth at connection handshake (can't expose key to client),
 * so we poll the server-side API route instead.
 */
export function useKalshiPolling(
  intervalMs: number = 10000
): UseKalshiPollingReturn {
  const [markets, setMarkets] = useState<KalshiMarketPrice[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const resp = await fetch("/api/markets", {
        signal: abortRef.current.signal,
        cache: "no-store",
      });

      if (!resp.ok) throw new Error(`API returned ${resp.status}`);

      const data = await resp.json();
      const kalshiMarkets = data.kalshi?.markets || [];

      const prices: KalshiMarketPrice[] = kalshiMarkets.map((m: any) => ({
        ticker: m.ticker,
        threshold: m.threshold,
        yesMid: m.yes?.mid || 0,
        yesBid: m.yes?.bid || 0,
        yesAsk: m.yes?.ask || 0,
        noMid: m.no?.mid || 0,
        volume: m.volume || 0,
      }));

      setMarkets(prices);
      setLastUpdate(new Date());
      setConnected(true);
      setError(null);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to fetch");
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    intervalRef.current = setInterval(fetchPrices, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      abortRef.current?.abort();
    };
  }, [fetchPrices, intervalMs]);

  return { markets, lastUpdate, connected, error };
}
