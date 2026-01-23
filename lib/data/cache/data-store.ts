/**
 * Simple in-memory cache with timestamps for NWS data
 */

import type { UnifiedForecastData } from "../fetchers";

interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  expiresAt: Date;
}

class DataStore {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private forecastData: UnifiedForecastData | null = null;
  private lastUpdate: Date | null = null;

  /**
   * Set cached data with TTL
   */
  set<T>(key: string, data: T, ttlMs: number = 900000): void {
    const now = new Date();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    });
  }

  /**
   * Get cached data if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if cache entry exists and is valid
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Get the timestamp of a cache entry
   */
  getTimestamp(key: string): Date | null {
    const entry = this.cache.get(key);
    return entry?.timestamp || null;
  }

  /**
   * Store unified forecast data
   */
  setForecastData(data: UnifiedForecastData): void {
    this.forecastData = data;
    this.lastUpdate = new Date();
  }

  /**
   * Get cached forecast data
   */
  getForecastData(): UnifiedForecastData | null {
    return this.forecastData;
  }

  /**
   * Get last update timestamp
   */
  getLastUpdate(): Date | null {
    return this.lastUpdate;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.forecastData = null;
    this.lastUpdate = null;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    lastUpdate: Date | null;
    keys: string[];
  } {
    return {
      entries: this.cache.size,
      lastUpdate: this.lastUpdate,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
export const dataStore = new DataStore();
