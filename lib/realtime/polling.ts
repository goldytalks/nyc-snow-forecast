/**
 * Polling Manager for real-time NWS data updates
 */

import { fetchAllNWSData, type UnifiedForecastData } from "../data/fetchers";
import { dataStore } from "../data/cache/data-store";
import { runForecastModelWithData, type ForecastOutput } from "../model";

type UpdateCallback = (forecast: ForecastOutput) => void;

interface PollingConfig {
  nwsIntervalMs: number; // How often to fetch NWS data
  enabled: boolean;
}

const DEFAULT_CONFIG: PollingConfig = {
  nwsIntervalMs: 15 * 60 * 1000, // 15 minutes
  enabled: true,
};

class PollingManager {
  private config: PollingConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private callbacks: Set<UpdateCallback> = new Set();
  private isPolling: boolean = false;
  private lastError: Error | null = null;

  constructor(config: Partial<PollingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Subscribe to forecast updates
   */
  subscribe(callback: UpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Notify all subscribers of new forecast
   */
  private notify(forecast: ForecastOutput): void {
    for (const callback of this.callbacks) {
      try {
        callback(forecast);
      } catch (error) {
        console.error("Error in polling callback:", error);
      }
    }
  }

  /**
   * Fetch new data and update forecast
   */
  async fetchAndUpdate(): Promise<ForecastOutput | null> {
    if (this.isPolling) {
      console.log("Already polling, skipping...");
      return null;
    }

    this.isPolling = true;
    this.lastError = null;

    try {
      console.log(`[${new Date().toISOString()}] Fetching NWS data...`);

      // Fetch all NWS data
      const nwsData = await fetchAllNWSData();
      dataStore.setForecastData(nwsData);

      // Run the model with new data
      const forecast = runForecastModelWithData(nwsData);

      console.log(
        `[${new Date().toISOString()}] Updated forecast: median=${forecast.distribution.median}"`
      );

      // Notify subscribers
      this.notify(forecast);

      return forecast;
    } catch (error) {
      this.lastError = error as Error;
      console.error("Polling error:", error);
      return null;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Start polling
   */
  start(): void {
    if (this.intervalId) {
      console.log("Polling already started");
      return;
    }

    if (!this.config.enabled) {
      console.log("Polling disabled");
      return;
    }

    console.log(
      `Starting NWS polling every ${this.config.nwsIntervalMs / 1000}s`
    );

    // Initial fetch
    this.fetchAndUpdate();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.fetchAndUpdate();
    }, this.config.nwsIntervalMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Polling stopped");
    }
  }

  /**
   * Get polling status
   */
  getStatus(): {
    isPolling: boolean;
    lastUpdate: Date | null;
    lastError: string | null;
    subscriberCount: number;
  } {
    return {
      isPolling: this.isPolling,
      lastUpdate: dataStore.getLastUpdate(),
      lastError: this.lastError?.message || null,
      subscriberCount: this.callbacks.size,
    };
  }

  /**
   * Get cached forecast data
   */
  getCachedData(): UnifiedForecastData | null {
    return dataStore.getForecastData();
  }
}

// Singleton instance
export const pollingManager = new PollingManager();

/**
 * Get current forecast, fetching if needed
 */
export async function getCurrentForecast(): Promise<ForecastOutput> {
  // Try to get cached data first
  const cached = pollingManager.getCachedData();

  if (cached) {
    return runForecastModelWithData(cached);
  }

  // No cache, fetch fresh
  const forecast = await pollingManager.fetchAndUpdate();

  if (forecast) {
    return forecast;
  }

  // Fallback to default model if fetch fails
  const { runForecastModel } = await import("../model");
  return runForecastModel();
}
