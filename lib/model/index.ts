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
  generatePolymarketScenarios,
  getCurrentConditions,
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
  polymarketDistribution?: {
    median: number;
    mean: number;
    stdDev: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
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
 * CRITICAL: This applies Central Park-specific corrections to regional NWS data.
 * Resolution source: weather.gov/wrh/climate?wfo=okx (NY CITY CENTRAL PARK)
 *
 * Central Park is a COASTAL location:
 * - NWS says "around 10 inches near the coast" vs "16 inches well inland"
 * - We must apply a coastal correction factor
 * - Higher mixing risk for coastal areas
 */
function runForecastModelImprovedWithData(data: UnifiedForecastData): ForecastOutput {
  // getCurrentConditions now uses live observed snowfall from data
  // and derives NWS range with observed as natural floor
  const conditions = getCurrentConditions(data);

  const kalshiScenarios = generateImprovedScenarios(conditions);
  const polymarketScenarios = generatePolymarketScenarios(conditions);
  const kalshiProbs = calculateKalshiProbabilities(kalshiScenarios);
  const polymarketProbs = calculatePolymarketProbabilities(polymarketScenarios);

  const mean = kalshiScenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);
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
      median: Math.round(conditions.nwsMedian * 10) / 10,
      mean: Math.round(mean * 10) / 10,
      stdDev: 3.5,
      p10: Math.round((conditions.nwsLow - 2) * 10) / 10,
      p25: Math.round(conditions.nwsLow * 10) / 10,
      p75: Math.round(conditions.nwsHigh * 10) / 10,
      p90: Math.round((conditions.nwsHigh + 3) * 10) / 10,
    },
    strikeProbabilities: kalshiProbs,
    kalshiProbabilities: kalshiProbs,
    polymarketProbabilities: polymarketProbs,
    polymarketDistribution: {
      median: Math.round((conditions.nwsMedian - conditions.feb24Expected) * 10) / 10,
      mean: Math.round(polymarketScenarios.reduce((sum, s) => sum + s.probability * s.mean, 0) * 10) / 10,
      stdDev: 3.5,
      p10: Math.round((conditions.nwsLow - 2 - conditions.feb24Expected) * 10) / 10,
      p25: Math.round((conditions.nwsLow - conditions.feb24Expected) * 10) / 10,
      p75: Math.round((conditions.nwsHigh - conditions.feb24Expected) * 10) / 10,
      p90: Math.round((conditions.nwsHigh + 3 - conditions.feb24Expected) * 10) / 10,
    },
    scenarios: kalshiScenarios.map((s) => ({
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
      `Observed snowfall: ${conditions.observedSnowfall}" (source: ${data.observedSnowfall?.source ?? 'hardcoded'}, updated: ${data.observedSnowfall?.lastUpdated ?? 'N/A'})`,
      `Daily breakdown: ${data.observedSnowfall?.dailyBreakdown ? Object.entries(data.observedSnowfall.dailyBreakdown).map(([d, v]) => `${d}: ${v}"`).join(', ') : 'N/A'}`,
      `CLINYC measurement bias: ${conditions.measurementBias}x (wind undercatch -10-20% vs compaction benefit +5-10%)`,
      `Measurement uncertainty: ±${conditions.measurementUncertainty}" added to scenario stddevs`,
      `Kalshi settles on CLINYC (Feb 21-24, 4 days) — final reports ~1:30 AM each night, settlement expected Feb 26`,
      `Polymarket settles on NOAA (Feb 21-23, 3 days) — bracket-based, EXCLUDES Feb 24`,
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
  const kalshiScenarios = generateImprovedScenarios(conditions);
  const polymarketScenarios = generatePolymarketScenarios(conditions);

  const kalshiProbs = calculateKalshiProbabilities(kalshiScenarios);
  const polymarketProbs = calculatePolymarketProbabilities(polymarketScenarios);

  // Calculate distribution statistics
  const mean = kalshiScenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);

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
      median: conditions.nwsMedian,
      mean: Math.round(mean * 10) / 10,
      stdDev: 3.5,
      p10: Math.round((conditions.nwsLow - 2) * 10) / 10,
      p25: Math.round((conditions.nwsLow) * 10) / 10,
      p75: Math.round((conditions.nwsHigh) * 10) / 10,
      p90: Math.round((conditions.nwsHigh + 3) * 10) / 10,
    },
    strikeProbabilities: kalshiProbs,
    kalshiProbabilities: kalshiProbs,
    polymarketProbabilities: polymarketProbs,
    polymarketDistribution: {
      median: Math.round((conditions.nwsMedian - conditions.feb24Expected) * 10) / 10,
      mean: Math.round(polymarketScenarios.reduce((sum, s) => sum + s.probability * s.mean, 0) * 10) / 10,
      stdDev: 3.5,
      p10: Math.round((conditions.nwsLow - 2 - conditions.feb24Expected) * 10) / 10,
      p25: Math.round((conditions.nwsLow - conditions.feb24Expected) * 10) / 10,
      p75: Math.round((conditions.nwsHigh - conditions.feb24Expected) * 10) / 10,
      p90: Math.round((conditions.nwsHigh + 3 - conditions.feb24Expected) * 10) / 10,
    },
    scenarios: kalshiScenarios.map((s) => ({
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
      `CLINYC observed: ${conditions.observedSnowfall}" (0.0" Feb 21 + 8.8" Feb 22)`,
      `Storm winding down Feb 23 — remaining snowfall uncertain`,
      `Kalshi (Feb 21-24, 4 days): settles on CLINYC, "strictly greater than" thresholds`,
      `Polymarket (Feb 21-23, 3 days): settles on NOAA "New Snow (IN)", bracket-based — EXCLUDES Feb 24`,
      `Different sources + date ranges = different settlement totals possible`,
    ],
    timing: {
      snowStarts: "2026-02-22T11:00:00Z",  // Sunday morning
      heaviestSnow: "2026-02-22T22:00:00Z", // Sunday night - 1-2"/hr rates
      mixingWindow: ["2026-02-22T00:00:00Z", "2026-02-22T00:00:00Z"], // No mixing expected
      snowEnds: "2026-02-23T18:00:00Z",     // Monday afternoon
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
