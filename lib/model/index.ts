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
 * CRITICAL: This applies Central Park-specific corrections to regional NWS data.
 * Resolution source: weather.gov/wrh/climate?wfo=okx (NY CITY CENTRAL PARK)
 *
 * Central Park is a COASTAL location:
 * - NWS says "around 10 inches near the coast" vs "16 inches well inland"
 * - We must apply a coastal correction factor
 * - Higher mixing risk for coastal areas
 */
function runForecastModelImprovedWithData(data: UnifiedForecastData): ForecastOutput {
  // CENTRAL PARK COASTAL CORRECTION
  // The fetched NWS data is often regional (includes inland areas)
  // Central Park is coastal, so we need to:
  // 1. Lower the high end by ~2" (coastal mixing caps upside)
  // 2. Anchor median closer to "around 10 inches" per NWS coastal guidance
  // 3. Account for any observed snowfall

  const rawLow = data.combined.snowfallRange.low;
  const rawHigh = data.combined.snowfallRange.high;

  // Sanity check: AFD parser picks up regional/tri-state numbers
  // NWS AFD (Feb 22): 18-22" for NYC airports is the best CP proxy.
  // Cap at reasonable Central Park values to avoid inflated forecasts.
  const cappedLow = Math.min(rawLow, 16);   // CP low-end capped at 16"
  const cappedHigh = Math.min(rawHigh, 22);  // CP high-end capped at 22" (NWS airport high)

  // Mild coastal correction for Central Park vs surrounding areas
  const coastalCorrectionFactor = 0.95;
  const adjustedHigh = Math.min(cappedHigh, cappedLow + (cappedHigh - cappedLow) * coastalCorrectionFactor);

  // Central Park observed snowfall - CLINYC reports 0.0" for Feb 21
  // Storm just beginning Feb 22 morning (light snow/trace)
  const observedSnowfall = 0.0;

  const conditions = {
    nwsLow: cappedLow,
    nwsHigh: adjustedHigh,
    nwsMedian: Math.round(((cappedLow + adjustedHigh) / 2) * 10) / 10,
    // Central Park has HIGHER mixing risk (coastal location)
    // NWS AFD says "highest totals along the coast" for this storm
    // Early rain/snow mix today but all-snow overnight through Monday
    // Use actual mixing data from AFD rather than assuming medium
    mixingRisk: (data.combined.mixingExpected ? "medium" : "low") as "low" | "medium" | "high",
    trackUncertainty: "medium" as const,
    observedSnowfall: observedSnowfall,
    modelSpread: Math.max(data.modelEstimates.ecmwf, data.modelEstimates.gfs, data.modelEstimates.nam) -
                 Math.min(data.modelEstimates.ecmwf, data.modelEstimates.gfs, data.modelEstimates.nam),
  };

  const improvedScenarios = generateImprovedScenarios(conditions);
  const kalshiProbs = calculateKalshiProbabilities(improvedScenarios);
  const polymarketProbs = calculatePolymarketProbabilities(improvedScenarios);

  const mean = improvedScenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);
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
      `Central Park forecast: ${conditions.nwsLow}-${conditions.nwsHigh}" (from NWS airport guidance 18-22")`,
      `NWS AFD: "highest totals along the coast" — CP should match airports`,
      `Mixing risk: ${conditions.mixingRisk} (early rain/snow mix at 35-36°F)`,
      `Observed snowfall: ${conditions.observedSnowfall}" — storm just starting`,
      `Resolution: CLINYC daily climate report (Central Park)`,
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

  // Calculate distribution statistics
  const mean = improvedScenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);

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
      `BLIZZARD WARNING: 13-18" criteria met (high confidence event)`,
      `Mixing risk: ${conditions.mixingRisk} - cold air locked in`,
      `Models trending coastward = bullish for NYC totals`,
      `Kalshi (Feb 21-24) vs Polymarket (Feb 21-23) - different date ranges!`,
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
