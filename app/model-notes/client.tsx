"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Snowflake, RefreshCw, TrendingUp, TrendingDown, Activity } from "lucide-react";

interface ForecastData {
  modelRunTimestamp: string;
  dataSourcesUsed: string[];
  distribution: {
    median: number;
    mean: number;
    stdDev: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
  strikeProbabilities: Record<string, number>;
  kalshiProbabilities?: Record<string, number>;
  polymarketProbabilities?: Record<string, number>;
  scenarios: Array<{
    name: string;
    probability: number;
    snowfallMean: number;
    snowfallRange: [number, number];
    color: string;
    description: string;
  }>;
  modelInputs: Record<string, any>;
  keyUncertainties: string[];
}

interface MarketData {
  kalshi: {
    markets: Array<{
      threshold: number;
      yes: { bid: number; ask: number; mid: number };
      volume: number;
    }>;
    positions: Array<{
      ticker: string;
      position: number;
      average_price: number;
      currentPrice: number;
      unrealized_pnl: number;
      total_cost: number;
    }>;
  };
  polymarket: {
    markets: Array<{
      question: string;
      outcomePrices: string;
    }>;
  };
}

export function ModelNotesClient({ forecast }: { forecast: ForecastData }) {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const resp = await fetch("/api/markets", { cache: "no-store" });
        if (resp.ok) {
          const data = await resp.json();
          setMarketData(data);
          setLastUpdate(new Date());
        }
      } catch {}
    };
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 10000);
    return () => clearInterval(interval);
  }, []);

  const kalshiMarkets = marketData?.kalshi?.markets || [];
  const kalshiPrices: Record<number, { bid: number; ask: number; mid: number }> = {};
  for (const m of kalshiMarkets) {
    kalshiPrices[m.threshold] = m.yes;
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 lg:px-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="animate-fade-in">
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Snowflake className="w-8 h-8 text-emerald-400" />
            Model Notes
          </h1>
          <p className="text-muted-foreground mt-1">
            Full methodology, weights, scenarios, and live market comparison
          </p>
          {lastUpdate && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              Live prices updating every 10s &bull; Last: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </header>

        {/* Resolution Source */}
        <section className="glass-card p-6 border border-yellow-500/30">
          <h2 className="text-lg font-semibold text-yellow-400 mb-3">Resolution Source</h2>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Kalshi:</span> NWS Daily Climate Report (CLINYC) for Central Park</p>
            <p><span className="text-muted-foreground">URL:</span>{" "}
              <a href="https://forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC"
                 className="text-emerald-400 hover:underline" target="_blank" rel="noopener">
                forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC
              </a>
            </p>
            <p><span className="text-muted-foreground">Settlement:</span> Total snowfall Feb 21-24, 2026. &quot;Strictly greater than&quot; threshold = YES.</p>
            <p><span className="text-muted-foreground">Current CLINYC:</span> 0.0&quot; for Feb 21. Storm just starting Feb 22.</p>
          </div>
        </section>

        {/* Model Architecture */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">Model Architecture</h2>
          <div className="space-y-3 text-sm">
            <p>Weighted mixture of <span className="text-white font-mono">4 Gamma distributions</span> across discrete scenarios.</p>
            <p className="text-muted-foreground">
              P(&gt;X) = &Sigma; [p_i &times; (1 - Gamma_CDF(X | shape_i, scale_i))]
            </p>
            <div className="mt-4 p-4 bg-black/40 rounded-lg font-mono text-xs overflow-x-auto">
              <p className="text-muted-foreground">// Gamma parameter conversion</p>
              <p>scale = stdDev&sup2; / mean</p>
              <p>shape = mean&sup2; / variance</p>
              <p className="mt-2 text-muted-foreground">// CDF via Simpson&apos;s rule (n=1000 points)</p>
              <p>P(X &le; x) = &int; Gamma_PDF(t, shape, scale) dt</p>
            </div>
          </div>
        </section>

        {/* NWS Data Inputs */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">NWS Data Inputs</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {Object.entries(forecast.modelInputs).map(([key, val]) => (
              <div key={key} className="p-3 bg-black/30 rounded-lg">
                <p className="text-muted-foreground text-xs uppercase">{key}</p>
                {val.range && <p className="text-white font-mono">{val.range[0]}&quot; - {val.range[1]}&quot;</p>}
                {val.value && <p className="text-white font-mono">{val.value}&quot;</p>}
                {val.confidence && <p className="text-xs text-muted-foreground">Confidence: {val.confidence}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            <p className="font-semibold text-white mb-1">Key NWS Guidance (Feb 22 AFD):</p>
            <ul className="list-disc list-inside space-y-1">
              <li>JFK/LGA/EWR: 18-22&quot; (best Central Park proxy)</li>
              <li>&quot;Highest totals expected along the coast&quot;</li>
              <li>NBM snow ratios &quot;consistently too high&quot; — gridpoint totals inflated</li>
              <li>Storm bulk: 7pm Sun through 7am Mon</li>
              <li>Early rain/snow mix at 35-36&deg;F, then all-snow</li>
            </ul>
          </div>
        </section>

        {/* Scenario Weights & Parameters */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">Scenario Weights & Parameters</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="pb-2 pr-4">Scenario</th>
                  <th className="pb-2 pr-4">Weight</th>
                  <th className="pb-2 pr-4">Mean</th>
                  <th className="pb-2 pr-4">Range (1.5&sigma;)</th>
                  <th className="pb-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {forecast.scenarios.map((s) => (
                  <tr key={s.name} className="border-b border-white/5">
                    <td className="py-3 pr-4">
                      <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </td>
                    <td className="py-3 pr-4 font-mono">{(s.probability * 100).toFixed(0)}%</td>
                    <td className="py-3 pr-4 font-mono">{s.snowfallMean.toFixed(1)}&quot;</td>
                    <td className="py-3 pr-4 font-mono text-muted-foreground">
                      {s.snowfallRange[0].toFixed(1)}&quot; - {s.snowfallRange[1].toFixed(1)}&quot;
                    </td>
                    <td className="py-3 text-muted-foreground">{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 bg-black/40 rounded-lg font-mono text-xs overflow-x-auto">
            <p className="text-muted-foreground mb-1">// Scenario weight logic</p>
            <p>baseCaseProb = 0.50</p>
            <p>highEndProb = mixingRisk === &quot;medium&quot; ? 0.10 : 0.13</p>
            <p>mixingProb = mixingRisk === &quot;medium&quot; ? 0.22 : 0.20</p>
            <p>bustProb = 1 - baseCaseProb - highEndProb - mixingProb</p>
            <p className="mt-2 text-muted-foreground">// Current: mixingRisk = &quot;medium&quot; (AFD mentions early rain/snow mix)</p>
          </div>
        </section>

        {/* Strike Probabilities vs Market */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">
            Strike Probabilities vs Live Market
            {lastUpdate && <span className="text-xs text-muted-foreground font-normal ml-2">(live)</span>}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="pb-2 pr-4">Strike</th>
                  <th className="pb-2 pr-4">Model P</th>
                  <th className="pb-2 pr-4">Market Bid</th>
                  <th className="pb-2 pr-4">Market Ask</th>
                  <th className="pb-2 pr-4">Market Mid</th>
                  <th className="pb-2">Edge</th>
                </tr>
              </thead>
              <tbody>
                {[2, 4, 6, 8, 10, 12, 15, 24].map((strike) => {
                  const modelP = forecast.strikeProbabilities[strike.toString()] || 0;
                  const mkt = kalshiPrices[strike];
                  const mid = mkt?.mid || 0;
                  const edge = modelP - mid;
                  const edgeColor = Math.abs(edge) < 0.03 ? "text-muted-foreground" :
                    edge > 0 ? "text-emerald-400" : "text-red-400";
                  return (
                    <tr key={strike} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-mono">&gt;{strike}&quot;</td>
                      <td className="py-2 pr-4 font-mono">{(modelP * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{mkt ? (mkt.bid * 100).toFixed(0) + "c" : "—"}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{mkt ? (mkt.ask * 100).toFixed(0) + "c" : "—"}</td>
                      <td className="py-2 pr-4 font-mono">{mkt ? (mid * 100).toFixed(1) + "%" : "—"}</td>
                      <td className={`py-2 font-mono flex items-center gap-1 ${edgeColor}`}>
                        {mkt ? (
                          <>
                            {edge > 0.03 ? <TrendingUp className="w-3 h-3" /> : edge < -0.03 ? <TrendingDown className="w-3 h-3" /> : null}
                            {(edge * 100).toFixed(1)}%
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Distribution Summary */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">Distribution Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Median", value: `${forecast.distribution.median}"` },
              { label: "Mean", value: `${forecast.distribution.mean}"` },
              { label: "P10", value: `${forecast.distribution.p10}"` },
              { label: "P25", value: `${forecast.distribution.p25}"` },
              { label: "P75", value: `${forecast.distribution.p75}"` },
              { label: "P90", value: `${forecast.distribution.p90}"` },
            ].map((item) => (
              <div key={item.label} className="p-3 bg-black/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-xl font-mono text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Polymarket Buckets */}
        {forecast.polymarketProbabilities && (
          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold text-emerald-400 mb-3">Polymarket Bucket Probabilities</h2>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
              {Object.entries(forecast.polymarketProbabilities).map(([bucket, prob]) => (
                <div key={bucket} className="p-3 bg-black/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{bucket}&quot;</p>
                  <p className="text-lg font-mono text-white">{(Number(prob) * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Positions */}
        {marketData?.kalshi?.positions && marketData.kalshi.positions.length > 0 && (
          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold text-emerald-400 mb-3">Current Positions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-2 pr-4">Ticker</th>
                    <th className="pb-2 pr-4">Qty</th>
                    <th className="pb-2 pr-4">Avg Cost</th>
                    <th className="pb-2 pr-4">Current</th>
                    <th className="pb-2 pr-4">Cost Basis</th>
                    <th className="pb-2">Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {marketData.kalshi.positions.map((pos) => {
                    const pnlColor = pos.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400";
                    return (
                      <tr key={pos.ticker} className="border-b border-white/5">
                        <td className="py-2 pr-4 font-mono text-xs">{pos.ticker}</td>
                        <td className="py-2 pr-4 font-mono">{pos.position}</td>
                        <td className="py-2 pr-4 font-mono">${pos.average_price.toFixed(3)}</td>
                        <td className="py-2 pr-4 font-mono">${pos.currentPrice.toFixed(3)}</td>
                        <td className="py-2 pr-4 font-mono">${pos.total_cost.toFixed(2)}</td>
                        <td className={`py-2 font-mono ${pnlColor}`}>
                          ${pos.unrealized_pnl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Key Uncertainties */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">Key Uncertainties</h2>
          <ul className="space-y-2 text-sm">
            {forecast.keyUncertainties.map((u, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">&#9679;</span>
                <span className="text-muted-foreground">{u}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Known Model Flaws */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-3">Known Model Limitations</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">1.</span>
              <div>
                <p className="text-white">4-scenario framework is too rigid</p>
                <p>Real snowfall outcomes don&apos;t fit into 4 boxes. The model can&apos;t simultaneously match market prices across all strikes — it tends to run below market on lower strikes and closer on higher ones.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">2.</span>
              <div>
                <p className="text-white">Scenario probabilities are subjective</p>
                <p>The weights (50/10/22/18) are educated guesses, not derived from ensemble data or historical calibration. Small weight changes cause large swings in output.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">3.</span>
              <div>
                <p className="text-white">AFD parser picks up regional numbers</p>
                <p>The NWS AFD discusses the tri-state broadly. Regex extraction can grab inland/worst-case numbers not applicable to Central Park. Caps are applied but imperfect.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">4.</span>
              <div>
                <p className="text-white">No uncertainty on the probabilities themselves</p>
                <p>P(&gt;15&quot;) = 42% could easily be 30-55% given input uncertainty. The model presents point estimates without confidence intervals.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">5.</span>
              <div>
                <p className="text-white">Can&apos;t model mesoscale snowband positioning</p>
                <p>If a heavy snowband parks over Central Park for 2-3 hours, totals could be 5-8&quot; higher than the model expects. This is inherently unpredictable.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">6.</span>
              <div>
                <p className="text-white">&gt;24&quot; heavily underestimated vs market</p>
                <p>Model says ~2% but market prices 9-13%. The market may be pricing in snowband tail risk that the Gamma distribution can&apos;t capture.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Source Code References */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">Source Code</h2>
          <div className="space-y-2 text-sm font-mono">
            {[
              { file: "lib/model/improved-model.ts", desc: "Gamma distribution model, scenario generation, CDF calculation" },
              { file: "lib/model/index.ts", desc: "Model orchestration, NWS data integration, coastal corrections" },
              { file: "lib/data/fetchers/nws-afd-parser.ts", desc: "NWS AFD text parsing, snowfall range extraction" },
              { file: "lib/data/fetchers/index.ts", desc: "NWS API data fetching, data combination" },
              { file: "lib/markets/kalshi-auth.ts", desc: "Kalshi API auth (RSA-PSS signing), position/orderbook fetching" },
              { file: "lib/markets/polymarket-profile.ts", desc: "Polymarket Data API positions, CLOB orderbook" },
              { file: "hooks/useKalshiPolling.ts", desc: "Client-side Kalshi price polling (10s interval)" },
              { file: "hooks/usePolymarketWebSocket.ts", desc: "Real-time Polymarket WebSocket price streaming" },
              { file: "app/api/markets/route.ts", desc: "Combined market data API endpoint" },
              { file: "app/api/forecast/route.ts", desc: "Forecast model API endpoint" },
            ].map(({ file, desc }) => (
              <div key={file} className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 py-2 border-b border-white/5">
                <span className="text-emerald-400 whitespace-nowrap">{file}</span>
                <span className="text-muted-foreground text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Model Run Info */}
        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3">Model Run Info</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Last run</p>
              <p className="font-mono">{new Date(forecast.modelRunTimestamp).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data sources</p>
              <p className="font-mono">{forecast.dataSourcesUsed.join(", ")}</p>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-muted-foreground py-4">
          Not financial advice. Model has significant uncertainty. Use at your own risk.
        </footer>
      </div>
    </main>
  );
}
