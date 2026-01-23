"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ForecastData } from "@/lib/types";

interface RealtimeContextValue {
  forecast: ForecastData | null;
  lastUpdate: Date | null;
  isConnected: boolean;
  error: string | null;
  refresh: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  forecast: null,
  lastUpdate: null,
  isConnected: false,
  error: null,
  refresh: () => {},
});

interface RealtimeProviderProps {
  children: ReactNode;
  initialData?: ForecastData;
}

export function RealtimeProvider({
  children,
  initialData,
}: RealtimeProviderProps) {
  const [forecast, setForecast] = useState<ForecastData | null>(
    initialData || null
  );
  const [lastUpdate, setLastUpdate] = useState<Date | null>(
    initialData ? new Date() : null
  );
  // Consider "connected" if we have data, even if SSE reconnecting
  const [isConnected, setIsConnected] = useState(!!initialData);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/forecast");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setForecast(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      eventSource = new EventSource("/api/forecast/stream");

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        console.log("[SSE] Connected");
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data.error) {
            setForecast(data);
            setLastUpdate(new Date());
          }
        } catch (err) {
          console.error("[SSE] Parse error:", err);
        }
      };

      eventSource.onerror = () => {
        // Only set disconnected if we don't have data - prevents flickering
        setError("Reconnecting...");
        console.error("[SSE] Connection error");

        // Close and attempt reconnect
        eventSource?.close();

        reconnectTimeout = setTimeout(() => {
          console.log("[SSE] Reconnecting...");
          connect();
        }, 5000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ forecast, lastUpdate, isConnected, error, refresh }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useForecast() {
  return useContext(RealtimeContext);
}
