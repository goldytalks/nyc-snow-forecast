"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/";

interface PriceData {
  bid: number;
  ask: number;
  last: number;
  midpoint: number;
}

interface UsePolymarketWebSocketReturn {
  prices: Record<string, PriceData>;
  connected: boolean;
  error: string | null;
}

/**
 * Client-side hook for real-time Polymarket price streaming via WebSocket.
 * Subscribes to the public "market" channel for given token IDs.
 * No authentication required.
 */
export function usePolymarketWebSocket(
  tokenIds: string[]
): UsePolymarketWebSocketReturn {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnects = 5;

  const connect = useCallback(() => {
    if (tokenIds.length === 0) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        // Subscribe to market channel with token IDs
        const subscribeMsg = {
          auth: {},
          type: "market",
          markets: tokenIds,
        };
        ws.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.event_type;

          if (eventType === "book") {
            // Full orderbook snapshot
            const assetId = data.asset_id;
            if (assetId) {
              const bids = data.bids || [];
              const asks = data.asks || [];
              const bestBid = bids.length > 0
                ? Math.max(...bids.map((b: any) => parseFloat(b.price)))
                : 0;
              const bestAsk = asks.length > 0
                ? Math.min(...asks.map((a: any) => parseFloat(a.price)))
                : 1;

              setPrices((prev) => ({
                ...prev,
                [assetId]: {
                  bid: bestBid,
                  ask: bestAsk,
                  last: prev[assetId]?.last || (bestBid + bestAsk) / 2,
                  midpoint: (bestBid + bestAsk) / 2,
                },
              }));
            }
          } else if (eventType === "price_change") {
            // Incremental price update
            const assetId = data.asset_id;
            if (assetId) {
              setPrices((prev) => {
                const existing = prev[assetId] || { bid: 0, ask: 1, last: 0, midpoint: 0.5 };
                const price = parseFloat(data.price || "0");
                const side = data.side;

                const updated = { ...existing };
                if (side === "BUY" || side === "bid") {
                  updated.bid = price;
                } else if (side === "SELL" || side === "ask") {
                  updated.ask = price;
                }
                updated.midpoint = (updated.bid + updated.ask) / 2;

                return { ...prev, [assetId]: updated };
              });
            }
          } else if (eventType === "last_trade_price") {
            const assetId = data.asset_id;
            if (assetId) {
              const price = parseFloat(data.price || "0");
              setPrices((prev) => ({
                ...prev,
                [assetId]: {
                  ...(prev[assetId] || { bid: 0, ask: 1, midpoint: 0.5 }),
                  last: price,
                },
              }));
            }
          }
        } catch {
          // Ignore parse errors from malformed messages
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);

        // Auto-reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnects) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };
    } catch (err) {
      setError(`Failed to connect: ${err}`);
      setConnected(false);
    }
  }, [tokenIds]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { prices, connected, error };
}
