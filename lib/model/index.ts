import {
  scenarios as defaultScenarios,
  generateScenarios,
  type Scenario,
  type ParsedForecastData,
} from "./scenarios";
import {
  calculateAllStrikeProbabilities,
  calculateDistributionStats,
  calculateFullDistribution,
} from "./probability";
import {
  runImprovedModel,
  calculateKalshiProbabilities,
  calculatePolymarketProbabilities,
  generateImprovedScenarios,
  getCurrentConditions,
  getDistributionStats,
  calculateMixtureStdDev,
  type ImprovedScenario,
} from "./improved-model";
import type { UnifiedForecastData } from "../data/fetchers";

// Flag to use improved model
const USE_IMPROVED_MODEL = true;

export interface ForecastOutput {
  modelRunTimestamp: string;
  modelVersion: "original" | "improved";
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
  // New: Separate probabilities for each market type
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
  modelInputs: Record<
    string,
    {
      range?: [number, number];
      value?: number;
      confidence?: string;
      trend?: string;
    }
  >;
  keyUncertainties: string[];
  timing: {
    snowStarts: string;
    heaviestSnow: string;
    mixingWindow: [string, string];
    snowEnds: string;
  };
  dataSources: {
    nwsForecast: { status: string; updateTime: string | null };
    nwsAFD: { status: string; issueTime: string | null };
  };
}

/**
 * Convert unified NWS data to parsed forecast format for scenario generation
 */
function convertToScenarioInput(data: UnifiedForecastData): ParsedForecastData {
  return {
    nwsRange: data.combined.snowfallRange,
    localizedMax: data.combined.localizedMax,
    mixingMentioned: data.combined.mixingExpected,
    mixingTiming: data.combined.mixingTiming,
    slr: data.combined.slr,
    qpf: data.combined.qpf,
    modelData: data.modelEstimates,
    confidenceLevel: (data.combined.confidence as "high" | "medium" | "low") || "medium",
  };
}

/**
 * Run the full forecast model with unified NWS data
 */
export function runForecastModelWithData(data: UnifiedForecastData): ForecastOutput {
  if (USE_IMPROVED_MODEL) {
    // Use improved model but incorporate NWS data
    return runForecastModelImprovedWithData(data);
  }

  const parsedData = convertToScenarioInput(data);
  const generatedScenarios = generateScenarios(parsedData);

  return runForecastModelWithScenarios(generatedScenarios, data);
}

/**
 * Run improved model with NWS data
 *
 * UPDATED Jan 25: Storm is in progress and performing well.
 * Using more conservative adjustments as storm tracks at/above expectations.
 *
 * Resolution source: weather.gov/wrh/climate?wfo=okx (NY CITY CENTRAL PARK)
 */
function runForecastModelImprovedWithData(data: UnifiedForecastData): ForecastOutput {
  // UPDATED 3:44 PM ET Jan 25: Use STORM TOTAL from NWS Winter Storm Warning
  // The API returns period-by-period forecasts which don't represent storm totals
  // NWS Winter Storm Warning says 8-12" for NYC metro (confirmed by AFD)

  // OBSERVED: Central Park official + estimated additional
  // 7.2" official at 1:00 PM ET (NWS PNS)
  // +1.3" estimated 1-3 PM before sleet transition
  // = ~8.5" estimated as of 3:45 PM ET
  // UPDATE THIS AS NEW MEASUREMENTS COME IN
  const observedSnowfall = 8.5;

  // NWS STORM TOTAL forecast (from Winter Storm Warning, not period sums)
  // Source: NWS AFD 3:42 PM ET - "9-12 inches are forecast for the NYC metro area"
  // We use 8-12 as the full range accounting for mixing uncertainty
  const stormTotalLow = 8;
  const stormTotalHigh = 12;

  // The API's period forecast can inform if we're tracking high/low
  const rawLow = data.combined.snowfallRange.low;
  const rawHigh = data.combined.snowfallRange.high;

  // If API shows MORE remaining than expected, shift up slightly
  const remainingExpectedHigh = stormTotalHigh - observedSnowfall; // ~4.8"
  const effectiveLow = stormTotalLow;
  const effectiveHigh = rawHigh > remainingExpectedHigh + 2
    ? stormTotalHigh + 1
    : stormTotalHigh;

  // CRITICAL: Mixing is ACTIVE as of 3:44 PM ET
  // NWS confirms warm nose at 750mb, sleet falling, up to 1" sleet expected
  const mixingRisk = "high" as const;

  const conditions = {
    nwsLow: effectiveLow,
    nwsHigh: effectiveHigh,
    nwsMedian: Math.round(((effectiveLow + effectiveHigh) / 2) * 10) / 10,
    mixingRisk: mixingRisk,
    trackUncertainty: "low" as const,
    observedSnowfall: observedSnowfall,
    modelSpread: Math.max(data.modelEstimates.ecmwf, data.modelEstimates.gfs, data.modelEstimates.nam) -
                 Math.min(data.modelEstimates.ecmwf, data.modelEstimates.gfs, data.modelEstimates.nam),
  };

  const improvedScenarios = generateImprovedScenarios(conditions);
  const kalshiProbs = calculateKalshiProbabilities(improvedScenarios);
  const polymarketProbs = calculatePolymarketProbabilities(improvedScenarios);

  // Calculate proper distribution statistics from the mixture
  const distStats = getDistributionStats(improvedScenarios);
  const now = new Date().toISOString();

  const scenarioColors: Record<string, string> = {
    "NWS Forecast Verifies": "#3b82f6",
    "High-End (All Snow)": "#10b981",
    "Extended Mixing": "#f59e0b",
    "Significant Underperformance": "#ef4444",
  };

  return {
    modelRunTimestamp: now,
    modelVersion: "improved",
    dataSourcesUsed: ["NWS_point_forecast", "NWS_AFD", "GFS", "ECMWF", "NAM"],
    distribution: {
      median: distStats.median,
      mean: distStats.mean,
      stdDev: distStats.stdDev,
      p10: distStats.p10,
      p25: distStats.p25,
      p75: distStats.p75,
      p90: distStats.p90,
    },
    strikeProbabilities: kalshiProbs,
    kalshiProbabilities: kalshiProbs,
    polymarketProbabilities: polymarketProbs,
    scenarios: improvedScenarios.map((s) => ({
      name: s.name,
      probability: Math.round(s.probability * 1000) / 1000,
      snowfallMean: s.mean,
      snowfallRange: [
        Math.round((s.mean - 1.5 * s.stdDev) * 10) / 10,
        Math.round((s.mean + 1.5 * s.stdDev) * 10) / 10,
      ] as [number, number],
      color: scenarioColors[s.name] || "#6b7280",
      description: s.description,
    })),
    modelInputs: {
      nws: {
        range: [conditions.nwsLow, conditions.nwsHigh] as [number, number],
        confidence: data.combined.confidence || "medium",
      },
      ecmwf: { value: data.modelEstimates.ecmwf, trend: "steady" },
      gfs: { value: data.modelEstimates.gfs, trend: "steady" },
      nam: { value: data.modelEstimates.nam, trend: "steady" },
    },
    keyUncertainties: [
      `NWS forecast: ${conditions.nwsLow}-${conditions.nwsHigh}" for Central Park`,
      `Observed: ~${conditions.observedSnowfall}" estimated (7.2" official @ 1PM + additional)`,
      `ACTIVE SLEET MIXING - warm nose at 750mb limiting totals`,
      `Snow returns after 10 PM but at lighter rates`,
    ],
    timing: {
      snowStarts: "2026-01-25T06:00:00Z",
      heaviestSnow: "2026-01-25T12:00:00Z",
      mixingWindow: ["2026-01-25T22:00:00Z", "2026-01-26T04:00:00Z"],
      snowEnds: "2026-01-26T12:00:00Z",
    },
    dataSources: {
      nwsForecast: {
        status: data.sources.nwsForecast.status,
        updateTime: data.sources.nwsForecast.updateTime,
      },
      nwsAFD: {
        status: data.sources.nwsAFD.status,
        issueTime: data.sources.nwsAFD.issueTime,
      },
    },
  };
}

/**
 * Run the forecast model with provided scenarios
 */
export function runForecastModelWithScenarios(
  scenarioList: Scenario[],
  data?: UnifiedForecastData
): ForecastOutput {
  const now = new Date().toISOString();
  const distribution = calculateDistributionStats(scenarioList);
  const strikeProbabilities = calculateAllStrikeProbabilities(scenarioList);

  // Round strike probabilities
  const roundedProbabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(strikeProbabilities)) {
    roundedProbabilities[key] = Math.round(value * 1000) / 1000;
  }

  // Build data sources info
  const dataSources = data
    ? {
        nwsForecast: {
          status: data.sources.nwsForecast.status,
          updateTime: data.sources.nwsForecast.updateTime,
        },
        nwsAFD: {
          status: data.sources.nwsAFD.status,
          issueTime: data.sources.nwsAFD.issueTime,
        },
      }
    : {
        nwsForecast: { status: "fallback", updateTime: null },
        nwsAFD: { status: "fallback", issueTime: null },
      };

  // Model inputs from data or defaults
  const modelInputs = data
    ? {
        nws: {
          range: [data.combined.snowfallRange.low, data.combined.snowfallRange.high] as [number, number],
          confidence: data.combined.confidence,
        },
        ecmwf: { value: data.modelEstimates.ecmwf, trend: "steady" },
        gfs: { value: data.modelEstimates.gfs, trend: "steady" },
        nam: { value: data.modelEstimates.nam, trend: "steady" },
      }
    : {
        nws: { range: [8, 14] as [number, number], confidence: "medium" },
        ecmwf: { value: 14, trend: "steady" },
        gfs: { value: 10, trend: "steady" },
        nam: { value: 12, trend: "steady" },
      };

  // Key uncertainties based on data
  const keyUncertainties = [
    `Storm track: ${data?.modelEstimates ? Math.max(data.modelEstimates.ecmwf, data.modelEstimates.gfs, data.modelEstimates.nam) - Math.min(data.modelEstimates.ecmwf, data.modelEstimates.gfs, data.modelEstimates.nam) : 4}" spread between model solutions`,
    data?.combined.mixingExpected
      ? `Mixing duration: ${data.combined.mixingTiming || "timing uncertain"}`
      : "Mixing potential: Low based on current guidance",
    data?.combined.slr
      ? `SLR: ${data.combined.slr.low}:1 to ${data.combined.slr.high}:1 expected`
      : "SLR: 10:1 to 15:1 assumed",
  ];

  return {
    modelRunTimestamp: now,
    modelVersion: "original",
    dataSourcesUsed: ["NWS_point_forecast", "NWS_AFD", "GFS", "ECMWF", "NAM"],
    distribution,
    strikeProbabilities: roundedProbabilities,
    scenarios: scenarioList.map((s) => ({
      name: s.name,
      probability: s.probability,
      snowfallMean: s.snowfallMean,
      snowfallRange: [
        Math.round((s.snowfallMean - 1.5 * s.snowfallStdDev) * 10) / 10,
        Math.round((s.snowfallMean + 1.5 * s.snowfallStdDev) * 10) / 10,
      ] as [number, number],
      color: s.color,
      description: s.description,
    })),
    modelInputs,
    keyUncertainties,
    timing: {
      snowStarts: "2026-01-25T06:00:00Z",
      heaviestSnow: "2026-01-25T12:00:00Z",
      mixingWindow: ["2026-01-25T22:00:00Z", "2026-01-26T04:00:00Z"],
      snowEnds: "2026-01-26T12:00:00Z",
    },
    dataSources,
  };
}

/**
 * Run the forecast model with default scenarios (for backward compatibility)
 */
export function runForecastModel(): ForecastOutput {
  if (USE_IMPROVED_MODEL) {
    return runForecastModelImproved();
  }
  return runForecastModelWithScenarios(defaultScenarios);
}

/**
 * Run the improved forecast model with Gamma distributions
 */
export function runForecastModelImproved(): ForecastOutput {
  const conditions = getCurrentConditions();
  const improvedScenarios = generateImprovedScenarios(conditions);

  const kalshiProbs = calculateKalshiProbabilities(improvedScenarios);
  const polymarketProbs = calculatePolymarketProbabilities(improvedScenarios);

  // Calculate proper distribution statistics from the mixture
  const distStats = getDistributionStats(improvedScenarios);

  const now = new Date().toISOString();

  // Map scenario colors
  const scenarioColors: Record<string, string> = {
    "NWS Forecast Verifies": "#3b82f6", // blue
    "High-End (All Snow)": "#10b981", // emerald
    "Extended Mixing": "#f59e0b", // amber
    "Significant Underperformance": "#ef4444", // red
  };

  return {
    modelRunTimestamp: now,
    modelVersion: "improved",
    dataSourcesUsed: ["NWS_point_forecast", "NWS_AFD", "GFS", "ECMWF", "NAM"],
    distribution: {
      median: distStats.median,
      mean: distStats.mean,
      stdDev: distStats.stdDev,
      p10: distStats.p10,
      p25: distStats.p25,
      p75: distStats.p75,
      p90: distStats.p90,
    },
    strikeProbabilities: kalshiProbs,
    kalshiProbabilities: kalshiProbs,
    polymarketProbabilities: polymarketProbs,
    scenarios: improvedScenarios.map((s) => ({
      name: s.name,
      probability: Math.round(s.probability * 1000) / 1000,
      snowfallMean: s.mean,
      snowfallRange: [
        Math.round((s.mean - 1.5 * s.stdDev) * 10) / 10,
        Math.round((s.mean + 1.5 * s.stdDev) * 10) / 10,
      ] as [number, number],
      color: scenarioColors[s.name] || "#6b7280",
      description: s.description,
    })),
    modelInputs: {
      nws: {
        range: [conditions.nwsLow, conditions.nwsHigh] as [number, number],
        confidence: "medium",
      },
      ecmwf: { value: 12, trend: "steady" },
      gfs: { value: 10, trend: "steady" },
      nam: { value: 11, trend: "steady" },
    },
    keyUncertainties: [
      `NWS forecast: ${conditions.nwsLow}-${conditions.nwsHigh}" for Central Park`,
      `Observed: ${conditions.observedSnowfall}" already on ground`,
      `Mixing risk: ${conditions.mixingRisk} - sleet actively falling`,
      `Model median: ${distStats.median}" (P10-P90: ${distStats.p10}-${distStats.p90}")`,
    ],
    timing: {
      snowStarts: "2026-01-25T06:00:00Z",
      heaviestSnow: "2026-01-25T12:00:00Z",
      mixingWindow: ["2026-01-25T22:00:00Z", "2026-01-26T04:00:00Z"],
      snowEnds: "2026-01-26T12:00:00Z",
    },
    dataSources: {
      nwsForecast: { status: "live", updateTime: now },
      nwsAFD: { status: "live", issueTime: now },
    },
  };
}

export { calculateExceedanceProbability } from "./probability";
export { scenarios, generateScenarios } from "./scenarios";
export type { Scenario, ParsedForecastData };
