/**
 * Unified data fetcher that combines all NWS data sources
 */

import {
  fetchNWSForecast,
  fetchNWSGridpointData,
  extractTotalSnowFromForecast,
  type NWSPointForecast,
  type NWSGridpointData,
} from "./nws-api";

import {
  fetchAndParseAFD,
  type AFDExtraction,
} from "./nws-afd-parser";

export interface UnifiedForecastData {
  timestamp: string;
  sources: {
    nwsForecast: {
      status: "success" | "error";
      updateTime: string | null;
      data: NWSPointForecast | null;
      snowTotal: { low: number; high: number } | null;
      error?: string;
    };
    nwsAFD: {
      status: "success" | "error";
      issueTime: string | null;
      data: AFDExtraction | null;
      error?: string;
    };
    nwsGridpoint: {
      status: "success" | "error";
      data: NWSGridpointData | null;
      error?: string;
    };
  };
  combined: {
    snowfallRange: { low: number; high: number };
    localizedMax: number | null;
    mixingExpected: boolean;
    mixingTiming: string | null;
    slr: { low: number; high: number } | null;
    qpf: number | null;
    confidence: string;
    keyPhrases: string[];
  };
  // Model estimates (hardcoded for now, would need scraping for real data)
  modelEstimates: {
    gfs: number;
    ecmwf: number;
    nam: number;
  };
}

/**
 * Fetch all data sources and combine into unified format
 */
export async function fetchAllNWSData(): Promise<UnifiedForecastData> {
  const timestamp = new Date().toISOString();

  // Fetch all sources in parallel
  const [forecastResult, afdResult, gridpointResult] = await Promise.allSettled([
    fetchNWSForecast(),
    fetchAndParseAFD(),
    fetchNWSGridpointData(),
  ]);

  // Process NWS Forecast
  let nwsForecastSource: UnifiedForecastData["sources"]["nwsForecast"];
  let forecastSnowTotal: { low: number; high: number } | null = null;

  if (forecastResult.status === "fulfilled") {
    forecastSnowTotal = extractTotalSnowFromForecast(forecastResult.value);
    nwsForecastSource = {
      status: "success",
      updateTime: forecastResult.value.updateTime,
      data: forecastResult.value,
      snowTotal: forecastSnowTotal,
    };
  } else {
    nwsForecastSource = {
      status: "error",
      updateTime: null,
      data: null,
      snowTotal: null,
      error: forecastResult.reason?.message || "Unknown error",
    };
  }

  // Process AFD
  let nwsAFDSource: UnifiedForecastData["sources"]["nwsAFD"];
  let afdData: AFDExtraction | null = null;

  if (afdResult.status === "fulfilled") {
    afdData = afdResult.value;
    nwsAFDSource = {
      status: "success",
      issueTime: afdResult.value.issueTime,
      data: afdResult.value,
    };
  } else {
    nwsAFDSource = {
      status: "error",
      issueTime: null,
      data: null,
      error: afdResult.reason?.message || "Unknown error",
    };
  }

  // Process Gridpoint
  let nwsGridpointSource: UnifiedForecastData["sources"]["nwsGridpoint"];

  if (gridpointResult.status === "fulfilled") {
    nwsGridpointSource = {
      status: "success",
      data: gridpointResult.value,
    };
  } else {
    nwsGridpointSource = {
      status: "error",
      data: null,
      error: gridpointResult.reason?.message || "Unknown error",
    };
  }

  // Combine data - prioritize AFD over point forecast
  const combinedSnowRange = afdData?.snowfallRange?.high
    ? afdData.snowfallRange
    : forecastSnowTotal
      ? { low: forecastSnowTotal.low, high: forecastSnowTotal.high }
      : { low: 8, high: 14 }; // Fallback based on current NWS guidance

  const combined: UnifiedForecastData["combined"] = {
    snowfallRange: combinedSnowRange,
    localizedMax: afdData?.localizedMax || null,
    mixingExpected: afdData?.mixingMentioned || false,
    mixingTiming: afdData?.mixingTiming || null,
    slr: afdData?.slrMentioned || null,
    qpf: afdData?.qpfMentioned || null,
    confidence: afdData?.confidenceLanguage?.[0] || "medium",
    keyPhrases: afdData?.keyPhrases || [],
  };

  // Model estimates - in production these would be scraped
  // Using current best estimates based on model runs
  const modelEstimates = {
    gfs: 10,
    ecmwf: 14,
    nam: 12,
  };

  return {
    timestamp,
    sources: {
      nwsForecast: nwsForecastSource,
      nwsAFD: nwsAFDSource,
      nwsGridpoint: nwsGridpointSource,
    },
    combined,
    modelEstimates,
  };
}

export type { NWSPointForecast, NWSGridpointData, AFDExtraction };
