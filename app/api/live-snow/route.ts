/**
 * Live Snow Tracking API
 * Fetches real-time observations from NWS for Central Park (KNYC)
 *
 * Data sources:
 * - NWS Observation API (api.weather.gov)
 * - Station: KNYC (Central Park)
 */

import { NextResponse } from "next/server";
import { getLatestCentralParkSnow } from "@/lib/data/fetchers/snow-observations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Central Park station ID
const STATION_ID = "KNYC";
const NWS_API_BASE = "https://api.weather.gov";

interface NWSObservation {
  properties: {
    timestamp: string;
    textDescription: string;
    temperature: { value: number | null; unitCode: string };
    dewpoint: { value: number | null; unitCode: string };
    windSpeed: { value: number | null; unitCode: string };
    windDirection: { value: number | null; unitCode: string };
    barometricPressure: { value: number | null; unitCode: string };
    visibility: { value: number | null; unitCode: string };
    relativeHumidity: { value: number | null; unitCode: string };
    precipitationLastHour: { value: number | null; unitCode: string };
    precipitationLast3Hours: { value: number | null; unitCode: string };
    precipitationLast6Hours: { value: number | null; unitCode: string };
    snowDepth?: { value: number | null; unitCode: string };
    presentWeather?: Array<{
      weather: string;
      intensity: string | null;
      modifier: string | null;
      rawString: string;
    }>;
  };
}

interface SnowObservation {
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
}

// Convert Celsius to Fahrenheit
function celsiusToFahrenheit(celsius: number | null): number | null {
  if (celsius === null) return null;
  return Math.round((celsius * 9/5 + 32) * 10) / 10;
}

// Convert meters to miles
function metersToMiles(meters: number | null): number | null {
  if (meters === null) return null;
  return Math.round((meters / 1609.344) * 10) / 10;
}

// Convert m/s to mph
function msToMph(ms: number | null): number | null {
  if (ms === null) return null;
  return Math.round(ms * 2.237 * 10) / 10;
}

// Convert mm to inches
function mmToInches(mm: number | null): number | null {
  if (mm === null) return null;
  return Math.round((mm / 25.4) * 100) / 100;
}

// Convert cm to inches
function cmToInches(cm: number | null): number | null {
  if (cm === null) return null;
  return Math.round((cm / 2.54) * 10) / 10;
}

// Get wind direction from degrees
function getWindDirection(degrees: number | null): string | null {
  if (degrees === null) return null;
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

// Detect if it's snowing from weather codes
function detectSnow(presentWeather: NWSObservation["properties"]["presentWeather"]): { isSnowing: boolean; intensity: string | null } {
  if (!presentWeather || presentWeather.length === 0) {
    return { isSnowing: false, intensity: null };
  }

  for (const wx of presentWeather) {
    const weather = wx.weather?.toLowerCase() || "";
    const rawString = wx.rawString?.toLowerCase() || "";

    if (weather.includes("snow") || rawString.includes("sn")) {
      let intensity = "light";
      if (wx.intensity === "heavy" || rawString.includes("+sn")) {
        intensity = "heavy";
      } else if (wx.intensity === "moderate" || rawString.match(/^sn/)) {
        intensity = "moderate";
      } else if (wx.intensity === "light" || rawString.includes("-sn")) {
        intensity = "light";
      }
      return { isSnowing: true, intensity };
    }
  }

  return { isSnowing: false, intensity: null };
}

async function fetchNWSObservation(): Promise<NWSObservation | null> {
  try {
    const response = await fetch(`${NWS_API_BASE}/stations/${STATION_ID}/observations/latest`, {
      headers: {
        "User-Agent": "(NYC Snow Forecast Dashboard, contact@example.com)",
        "Accept": "application/geo+json",
      },
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      console.error(`NWS API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch NWS observation:", error);
    return null;
  }
}

// Fetch multiple recent observations to calculate accumulation
async function fetchRecentObservations(): Promise<NWSObservation[]> {
  try {
    // Get observations from the last 24 hours
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(
      `${NWS_API_BASE}/stations/${STATION_ID}/observations?start=${startTime}&end=${endTime}`,
      {
        headers: {
          "User-Agent": "(NYC Snow Forecast Dashboard, contact@example.com)",
          "Accept": "application/geo+json",
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      console.error(`NWS API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.features || [];
  } catch (error) {
    console.error("Failed to fetch NWS observations:", error);
    return [];
  }
}

export async function GET() {
  try {
    // Fetch latest observation, recent history, and official snow reports
    const [latestObs, recentObs, officialSnow] = await Promise.all([
      fetchNWSObservation(),
      fetchRecentObservations(),
      getLatestCentralParkSnow(),
    ]);

    if (!latestObs) {
      return NextResponse.json(
        { error: "Failed to fetch observation data" },
        { status: 503 }
      );
    }

    const props = latestObs.properties;
    const snowInfo = detectSnow(props.presentWeather);

    // Extract temperature (NWS gives Celsius)
    const tempC = props.temperature?.value;
    const tempF = celsiusToFahrenheit(tempC);

    // Extract precipitation values (NWS gives mm)
    const precip1h = props.precipitationLastHour?.value;
    const precip3h = props.precipitationLast3Hours?.value;
    const precip6h = props.precipitationLast6Hours?.value;

    // Extract snow depth (NWS gives cm when available)
    const snowDepthCm = props.snowDepth?.value ?? null;

    // Calculate total precipitation from recent observations
    let totalPrecipMm = 0;
    let snowObservationCount = 0;
    const observationTimes: string[] = [];

    for (const obs of recentObs) {
      const obProps = obs.properties;
      if (obProps.precipitationLastHour?.value) {
        // Only count if temperature was below freezing (likely snow)
        const obsTempC = obProps.temperature?.value;
        if (obsTempC !== null && obsTempC <= 2) { // Allow slight buffer above freezing
          totalPrecipMm += obProps.precipitationLastHour.value;
        }
      }

      // Count snow observations
      const obsSnow = detectSnow(obProps.presentWeather);
      if (obsSnow.isSnowing) {
        snowObservationCount++;
        observationTimes.push(obProps.timestamp);
      }
    }

    // Estimate snow accumulation using 10:1 ratio (typical for temperatures near freezing)
    // This is a rough estimate - actual ratio varies from 5:1 to 20:1
    const estimatedSnowMm = totalPrecipMm * 10;
    const estimatedSnowInches = mmToInches(estimatedSnowMm);

    const observation: SnowObservation = {
      timestamp: props.timestamp,
      stationId: STATION_ID,
      stationName: "Central Park, NYC",
      conditions: props.textDescription || "Unknown",
      temperature: {
        fahrenheit: tempF,
        celsius: tempC,
      },
      windSpeed: {
        mph: msToMph(props.windSpeed?.value),
        direction: getWindDirection(props.windDirection?.value),
      },
      visibility: {
        miles: metersToMiles(props.visibility?.value),
      },
      humidity: props.relativeHumidity?.value ? Math.round(props.relativeHumidity.value) : null,
      isSnowing: snowInfo.isSnowing,
      snowIntensity: snowInfo.intensity,
      precipitation: {
        lastHour: {
          mm: precip1h,
          inches: mmToInches(precip1h),
        },
        last3Hours: {
          mm: precip3h,
          inches: mmToInches(precip3h),
        },
        last6Hours: {
          mm: precip6h,
          inches: mmToInches(precip6h),
        },
      },
      snowDepth: {
        cm: snowDepthCm,
        inches: cmToInches(snowDepthCm),
      },
      rawWeather: props.presentWeather?.map(w => w.rawString) || [],
    };

    // Storm tracking data
    const stormTracking = {
      // Manual accumulation tracking - update this as storm progresses
      // This should be updated based on official NWS reports
      manualAccumulation: {
        asOf: "2026-01-25T12:00:00Z",
        inches: 0.3, // From NWS Daily Climate Report
        source: "NWS CLINYC Daily Climate Report",
        note: "Official measurement from Central Park",
      },
      // Estimated from precipitation data
      estimatedAccumulation: {
        inches: estimatedSnowInches,
        note: "Estimated from precipitation data using 10:1 ratio",
        confidence: "low",
      },
      // Storm period
      stormPeriod: {
        start: "2026-01-25T06:00:00Z", // Expected start
        end: "2026-01-27T06:00:00Z",   // Expected end
        isActive: snowInfo.isSnowing,
      },
      // Recent snow observations count
      recentSnowObservations: snowObservationCount,
      totalObservationsChecked: recentObs.length,
    };

    return NextResponse.json({
      success: true,
      observation,
      stormTracking,
      // Official snow count from NWS PNS/LSR
      officialSnow: {
        stormTotal: officialSnow.observed,
        observationTime: officialSnow.observedTime,
        source: officialSnow.source,
        isOfficial: officialSnow.isOfficial,
        lastChecked: officialSnow.lastChecked,
        recentReports: officialSnow.allReports,
      },
      // Top-level fields for easy access
      stormTotal: officialSnow.observed,
      snowDepth: officialSnow.observed,
      isOfficial: officialSnow.isOfficial,
      observationTime: officialSnow.observedTime,
      metadata: {
        fetchedAt: new Date().toISOString(),
        source: "NWS api.weather.gov + NWS PNS/LSR",
        station: `${STATION_ID} - Central Park`,
        note: "Official snow total from NWS Public Information Statement",
      },
    });
  } catch (error) {
    console.error("Live snow API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
