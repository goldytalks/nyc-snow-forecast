"use client";

import { useForecast } from "@/components/RealtimeProvider";
import { HeroForecast } from "@/components/HeroForecast";
import { ProbabilityChart } from "@/components/ProbabilityChart";
import { StrikeCards } from "@/components/StrikeCards";
import { ScenarioBreakdown } from "@/components/ScenarioBreakdown";
import { ModelComparison } from "@/components/ModelComparison";
import { UncertaintyPanel } from "@/components/UncertaintyPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TimingPanel } from "@/components/TimingPanel";
import { MarketAnalysis } from "@/components/MarketAnalysis";
import { DataSourcesPanel } from "@/components/DataSourcesPanel";
import { PolymarketBuckets } from "@/components/PolymarketBuckets";
import { MapPin, Snowflake, RefreshCw, FileText } from "lucide-react";
import Link from "next/link";
import type { ForecastData } from "@/lib/types";

interface DashboardProps {
  initialData: ForecastData;
}

export function Dashboard({ initialData }: DashboardProps) {
  const { forecast, lastUpdate, isConnected, refresh } = useForecast();

  // Use real-time data if available, otherwise fall back to initial
  const data = forecast || initialData;

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Snowflake className="w-8 h-8 text-emerald-400" />
              NYC Snowfall Forecast
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Central Park &bull; Kalshi: Feb 21-24 (CLINYC) &bull; Polymarket: Feb 21-23 (NOAA)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator
              timestamp={data.modelRunTimestamp}
              sources={data.dataSourcesUsed}
              isConnected={isConnected}
              lastUpdate={lastUpdate}
            />
            <Link
              href="/model-notes"
              className="px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors flex items-center gap-2 text-sm text-emerald-400"
            >
              <FileText className="w-4 h-4" />
              Model Notes
            </Link>
            <button
              onClick={refresh}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="Refresh forecast"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Hero */}
        <div
          className="animate-fade-in"
          style={{ animationDelay: "0.1s" }}
        >
          <HeroForecast distribution={data.distribution} />
        </div>

        {/* Kalshi Section — Feb 21-24 */}
        <div className="animate-fade-in space-y-4" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-blue-400">
              Kalshi Model
            </h2>
            <span className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5">
              Feb 21–24 &bull; 4 days &bull; CLINYC &bull; &gt; threshold
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProbabilityChart strikeProbabilities={data.kalshiProbabilities || data.strikeProbabilities} />
            <div>
              <StrikeCards strikeProbabilities={data.kalshiProbabilities || data.strikeProbabilities} />
            </div>
          </div>
        </div>

        {/* Polymarket Section — Feb 21-23 */}
        <div className="animate-fade-in space-y-4" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-purple-400">
              Polymarket Model
            </h2>
            <span className="text-xs text-muted-foreground bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
              Feb 21–23 &bull; 3 days &bull; NOAA &bull; brackets
            </span>
          </div>
          <PolymarketBuckets probabilities={data.polymarketProbabilities || {}} />
        </div>

        {/* Market Analysis Section */}
        <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <h2 className="text-lg font-medium mb-3 text-muted-foreground">
            Market Analysis &amp; Edge
          </h2>
          <MarketAnalysis strikeProbabilities={data.kalshiProbabilities || data.strikeProbabilities} />
        </div>

        {/* Secondary Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in"
          style={{ animationDelay: "0.3s" }}
        >
          {/* Scenarios */}
          <ScenarioBreakdown scenarios={data.scenarios} />

          {/* Model Comparison */}
          <ModelComparison modelInputs={data.modelInputs} />

          {/* Timing */}
          <TimingPanel timing={data.timing} />
        </div>

        {/* Data Sources */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in"
          style={{ animationDelay: "0.35s" }}
        >
          <DataSourcesPanel dataSources={data.dataSources} />

          {/* Uncertainties */}
          <UncertaintyPanel uncertainties={data.keyUncertainties} />
        </div>

        {/* Footer */}
        <footer
          className="text-center text-sm text-muted-foreground pt-8 border-t border-border animate-fade-in"
          style={{ animationDelay: "0.4s" }}
        >
          <p>
            Probabilistic forecast model for Central Park snowfall. Settlement
            based on NWS official measurements.
          </p>
          <p className="mt-1">
            Data sources: NWS Point Forecast, NWS AFD, GFS, ECMWF, NAM
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Model is independent of market prices. Update market prices in
            lib/markets/manual-prices.ts
          </p>
        </footer>
      </div>
    </main>
  );
}
