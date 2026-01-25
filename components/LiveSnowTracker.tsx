"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Snowflake,
  Thermometer,
  Wind,
  Eye,
  Droplets,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CloudSnow,
  Clock,
  MapPin,
  ExternalLink,
} from "lucide-react";

interface LiveSnowData {
  success: boolean;
  observation: {
    timestamp: string;
    stationId: string;
    stationName: string;
    conditions: string;
    temperature: { fahrenheit: number | null; celsius: number | null };
    windSpeed: { mph: number | null; direction: string | null };
    visibility: { miles: number | null };
    humidity: number | null;
    isSnowing: boolean;
    snowIntensity: string | null;
    precipitation: {
      lastHour: { inches: number | null; mm: number | null };
      last3Hours: { inches: number | null; mm: number | null };
      last6Hours: { inches: number | null; mm: number | null };
    };
    snowDepth: { inches: number | null; cm: number | null };
    rawWeather: string[];
  };
  stormTracking: {
    manualAccumulation: {
      asOf: string;
      inches: number;
      source: string;
      note: string;
    };
    estimatedAccumulation: {
      inches: number | null;
      note: string;
      confidence: string;
    };
    stormPeriod: {
      start: string;
      end: string;
      isActive: boolean;
    };
    recentSnowObservations: number;
    totalObservationsChecked: number;
  };
  metadata: {
    fetchedAt: string;
    source: string;
    station: string;
    note: string;
  };
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "Unknown";
  }
}

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "Unknown";
  }
}

export function LiveSnowTracker() {
  const [data, setData] = useState<LiveSnowData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/live-snow");

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      setLastFetch(new Date());
    } catch (err) {
      console.error("Failed to fetch live snow data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const obs = data?.observation;
  const storm = data?.stormTracking;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium text-muted-foreground flex items-center gap-2">
            <CloudSnow className="w-5 h-5 text-sky-400" />
            Live Snow Tracking
          </h2>
          {obs?.isSnowing && (
            <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 animate-pulse">
              <Snowflake className="w-3 h-3 mr-1" />
              SNOWING NOW
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastFetch && <span>Updated {formatTimeAgo(lastFetch.toISOString())}</span>}
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-1.5 hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Accumulation Card - The Big Number */}
        <Card className="bg-card border-sky-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Snowflake className="w-5 h-5 text-sky-400" />
              Storm Total Accumulation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Main accumulation display */}
                <div className="text-center py-4">
                  <div className="text-6xl font-bold text-sky-400 font-mono">
                    {storm?.manualAccumulation?.inches.toFixed(1) || "0.0"}"
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    Official NWS Measurement
                  </div>
                  <div className="text-xs text-muted-foreground/70 mt-1">
                    As of {storm?.manualAccumulation?.asOf ? formatTime(storm.manualAccumulation.asOf) : "N/A"}
                  </div>
                </div>

                {/* Source info */}
                <div className="text-center border-t border-border pt-4">
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span>{storm?.manualAccumulation?.source || "Central Park"}</span>
                  </div>
                  <a
                    href="https://www.weather.gov/wrh/climate?wfo=okx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-sky-400 hover:text-sky-300"
                  >
                    View Official Report <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Estimated accumulation */}
                {storm?.estimatedAccumulation?.inches !== null && storm?.estimatedAccumulation?.inches !== undefined && (
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-sm text-muted-foreground">Estimated from Precip Data</div>
                    <div className="text-2xl font-bold font-mono text-muted-foreground/70">
                      ~{storm?.estimatedAccumulation?.inches?.toFixed(1) || "0.0"}"
                    </div>
                    <div className="text-xs text-muted-foreground/50 mt-1">
                      {storm?.estimatedAccumulation?.note || ""}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Conditions Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              Current Conditions
              {obs?.timestamp && (
                <span className="text-xs font-normal text-muted-foreground ml-auto">
                  {formatTimeAgo(obs.timestamp)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Weather description */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <span className="text-sm font-medium">{obs?.conditions || "Unknown"}</span>
                  {obs?.isSnowing ? (
                    <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30">
                      {obs.snowIntensity?.toUpperCase() || "SNOW"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      NO SNOW
                    </Badge>
                  )}
                </div>

                {/* Conditions grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Temperature */}
                  <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                    <Thermometer className="w-5 h-5 text-red-400" />
                    <div>
                      <div className="text-lg font-bold font-mono">
                        {obs?.temperature?.fahrenheit !== null && obs?.temperature?.fahrenheit !== undefined
                          ? `${obs.temperature.fahrenheit}°F`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Temperature</div>
                    </div>
                  </div>

                  {/* Wind */}
                  <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                    <Wind className="w-5 h-5 text-blue-400" />
                    <div>
                      <div className="text-lg font-bold font-mono">
                        {obs?.windSpeed?.mph !== null && obs?.windSpeed?.mph !== undefined
                          ? `${obs.windSpeed.mph}`
                          : "—"}
                        <span className="text-sm font-normal text-muted-foreground ml-1">mph</span>
                        {obs?.windSpeed?.direction && (
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            {obs.windSpeed.direction}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">Wind</div>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                    <Eye className="w-5 h-5 text-purple-400" />
                    <div>
                      <div className="text-lg font-bold font-mono">
                        {obs?.visibility?.miles !== null && obs?.visibility?.miles !== undefined
                          ? `${obs.visibility.miles}`
                          : "—"}
                        <span className="text-sm font-normal text-muted-foreground ml-1">mi</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Visibility</div>
                    </div>
                  </div>

                  {/* Humidity */}
                  <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                    <Droplets className="w-5 h-5 text-cyan-400" />
                    <div>
                      <div className="text-lg font-bold font-mono">
                        {obs?.humidity !== null && obs?.humidity !== undefined ? `${obs.humidity}%` : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Humidity</div>
                    </div>
                  </div>
                </div>

                {/* Precipitation data */}
                <div className="border-t border-border pt-3">
                  <div className="text-xs text-muted-foreground font-medium mb-2">Recent Precipitation</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/20 rounded p-2">
                      <div className="text-sm font-mono font-bold">
                        {obs?.precipitation?.lastHour?.inches !== null && obs?.precipitation?.lastHour?.inches !== undefined
                          ? `${obs.precipitation.lastHour.inches}"`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">1hr</div>
                    </div>
                    <div className="bg-muted/20 rounded p-2">
                      <div className="text-sm font-mono font-bold">
                        {obs?.precipitation?.last3Hours?.inches !== null && obs?.precipitation?.last3Hours?.inches !== undefined
                          ? `${obs.precipitation.last3Hours.inches}"`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">3hr</div>
                    </div>
                    <div className="bg-muted/20 rounded p-2">
                      <div className="text-sm font-mono font-bold">
                        {obs?.precipitation?.last6Hours?.inches !== null && obs?.precipitation?.last6Hours?.inches !== undefined
                          ? `${obs.precipitation.last6Hours.inches}"`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">6hr</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Storm Status Bar */}
      <Card className="bg-card border-border">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {storm?.stormPeriod?.isActive ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Clock className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm">
                  Storm Status:{" "}
                  <span className={storm?.stormPeriod?.isActive ? "text-emerald-400" : "text-muted-foreground"}>
                    {storm?.stormPeriod?.isActive ? "Active" : "Not Active"}
                  </span>
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Snow observations (24hr): {storm?.recentSnowObservations || 0}/{storm?.totalObservationsChecked || 0}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Source: {data?.metadata?.station || "NWS Central Park"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground/70 text-center">
        Live data from NWS api.weather.gov. Official storm totals from NWS Daily Climate Report (CLINYC).
        Accumulation updates may be delayed during active snowfall.
      </div>
    </div>
  );
}
