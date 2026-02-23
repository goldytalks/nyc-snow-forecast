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
import { MapPin, Snowflake, RefreshCw, FileText, Target, DollarSign } from "lucide-react";
import Link from "next/link";
import type { ForecastData } from "@/lib/types";

interface DashboardProps {
  initialData: ForecastData;
}

export function Dashboard({ initialData }: DashboardProps) {
  const { forecast, lastUpdate, isConnected, refresh } = useForecast();

  // Use real-time data if available, otherwise fall back to initial
  const data = forecast || initialData;

  const kalshiProbs = data.kalshiProbabilities || data.strikeProbabilities;
  const polymarketProbs = data.polymarketProbabilities || {};
  const polymarketDist = data.polymarketDistribution || {
    ...data.distribution,
    median: data.distribution.median - 0.5,
    mean: data.distribution.mean - 0.5,
    p10: data.distribution.p10 - 0.5,
    p25: data.distribution.p25 - 0.5,
    p75: data.distribution.p75 - 0.5,
    p90: data.distribution.p90 - 0.5,
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Snowflake className="w-8 h-8 text-emerald-400" />
              NYC Snowfall Forecast
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Central Park &bull; Two markets, two date ranges
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

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* KALSHI DASHBOARD — Feb 21-24 (4 days, CLINYC)             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <section className="space-y-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {/* Section Header */}
          <div className="flex items-center gap-3 border-b border-blue-500/30 pb-3">
            <Target className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-blue-400">
                Kalshi
              </h2>
              <p className="text-xs text-muted-foreground">
                Feb 21–24 &bull; 4 days &bull; CLINYC &bull; &quot;strictly greater than&quot; thresholds
              </p>
            </div>
          </div>

          {/* Kalshi Hero + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HeroForecast distribution={data.distribution} />
            <ProbabilityChart strikeProbabilities={kalshiProbs} />
          </div>

          {/* Kalshi Strike Cards */}
          <StrikeCards strikeProbabilities={kalshiProbs} />
        </section>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* POLYMARKET DASHBOARD — Feb 21-23 (3 days, NOAA)           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <section className="space-y-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          {/* Section Header */}
          <div className="flex items-center gap-3 border-b border-purple-500/30 pb-3">
            <DollarSign className="w-6 h-6 text-purple-400" />
            <div>
              <h2 className="text-xl font-bold text-purple-400">
                Polymarket
              </h2>
              <p className="text-xs text-muted-foreground">
                Feb 21–23 &bull; 3 days &bull; NOAA &quot;New Snow (IN)&quot; &bull; bracket-based
              </p>
            </div>
          </div>

          {/* Polymarket Hero + Buckets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HeroForecast distribution={polymarketDist} />
            <div className="flex flex-col justify-center">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Bucket Probabilities</h3>
              <PolymarketBuckets probabilities={polymarketProbs} />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MARKET ANALYSIS & EDGE (combined)                         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-lg font-medium mb-3 text-muted-foreground">
            Market Analysis &amp; Edge
          </h2>
          <MarketAnalysis strikeProbabilities={kalshiProbs} />
        </div>

        {/* Secondary Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in"
          style={{ animationDelay: "0.35s" }}
        >
          <ScenarioBreakdown scenarios={data.scenarios} />
          <ModelComparison modelInputs={data.modelInputs} />
          <TimingPanel timing={data.timing} />
        </div>

        {/* Data Sources */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in"
          style={{ animationDelay: "0.4s" }}
        >
          <DataSourcesPanel dataSources={data.dataSources} />
          <UncertaintyPanel uncertainties={data.keyUncertainties} />
        </div>

        {/* Footer */}
        <footer
          className="text-center text-sm text-muted-foreground pt-8 border-t border-border animate-fade-in"
          style={{ animationDelay: "0.45s" }}
        >
          <p>
            Probabilistic forecast model for Central Park snowfall. Settlement
            based on NWS official measurements.
          </p>
          <p className="mt-1">
            Data sources: NWS Point Forecast, NWS AFD, GFS, ECMWF, NAM
          </p>
        </footer>
      </div>
    </main>
  );
}
