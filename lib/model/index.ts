import { scenarios } from "./scenarios";
import {
  calculateAllStrikeProbabilities,
  calculateDistributionStats,
} from "./probability";

export interface ForecastOutput {
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
}

/**
 * Run the full forecast model and return structured output
 */
export function runForecastModel(): ForecastOutput {
  const now = new Date().toISOString();
  const distribution = calculateDistributionStats();
  const strikeProbabilities = calculateAllStrikeProbabilities();

  // Round strike probabilities
  const roundedProbabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(strikeProbabilities)) {
    roundedProbabilities[key] = Math.round(value * 1000) / 1000;
  }

  return {
    modelRunTimestamp: now,
    dataSourcesUsed: ["NWS_point_forecast", "NWS_AFD", "GFS", "ECMWF", "NAM"],
    distribution,
    strikeProbabilities: roundedProbabilities,
    scenarios: scenarios.map((s) => ({
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
    modelInputs: {
      nws: { range: [7, 11], confidence: "medium" },
      ecmwf: { value: 12, trend: "steady" },
      gfs: { value: 8, trend: "down" },
      nam: { value: 10, trend: "up" },
    },
    keyUncertainties: [
      "Storm track: 50km spread between model solutions",
      "Mixing duration: NWS forecasts 4hrs but could be 2-8hrs",
      "Snow-to-liquid ratio: 10:1 assumed but could be 8:1 to 15:1",
    ],
    timing: {
      snowStarts: "2026-01-25T06:00:00Z",
      heaviestSnow: "2026-01-25T12:00:00Z",
      mixingWindow: ["2026-01-25T22:00:00Z", "2026-01-26T04:00:00Z"],
      snowEnds: "2026-01-26T12:00:00Z",
    },
  };
}

export { calculateExceedanceProbability } from "./probability";
export { scenarios } from "./scenarios";
