/**
 * NWS API Client for fetching official weather forecast data
 * Central Park coordinates: 40.7812, -73.9665
 */

export interface NWSForecastPeriod {
  name: string;
  detailedForecast: string;
  shortForecast: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  snowAmount?: { low: number; high: number };
  startTime: string;
  endTime: string;
}

export interface NWSPointForecast {
  updateTime: string;
  periods: NWSForecastPeriod[];
  gridId: string;
  gridX: number;
  gridY: number;
}

export interface NWSGridpointData {
  snowfallAmount: Array<{
    validTime: string;
    value: number | null;
  }>;
  quantitativePrecipitation: Array<{
    validTime: string;
    value: number | null;
  }>;
  temperature: Array<{
    validTime: string;
    value: number | null;
  }>;
}

const NWS_USER_AGENT = "(nyc-snow-forecast, contact@example.com)";
const CENTRAL_PARK_LAT = 40.7812;
const CENTRAL_PARK_LON = -73.9665;

/**
 * Fetch NWS point metadata to get grid endpoints
 */
export async function fetchNWSPointMetadata(): Promise<{
  gridId: string;
  gridX: number;
  gridY: number;
  forecastUrl: string;
  forecastHourlyUrl: string;
  forecastGridDataUrl: string;
}> {
  const url = `https://api.weather.gov/points/${CENTRAL_PARK_LAT},${CENTRAL_PARK_LON}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": NWS_USER_AGENT,
      Accept: "application/geo+json",
    },
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!response.ok) {
    throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const props = data.properties;

  return {
    gridId: props.gridId,
    gridX: props.gridX,
    gridY: props.gridY,
    forecastUrl: props.forecast,
    forecastHourlyUrl: props.forecastHourly,
    forecastGridDataUrl: props.forecastGridData,
  };
}

/**
 * Fetch detailed forecast from NWS
 */
export async function fetchNWSForecast(): Promise<NWSPointForecast> {
  const metadata = await fetchNWSPointMetadata();

  const response = await fetch(metadata.forecastUrl, {
    headers: {
      "User-Agent": NWS_USER_AGENT,
      Accept: "application/geo+json",
    },
    next: { revalidate: 1800 }, // Cache for 30 minutes
  });

  if (!response.ok) {
    throw new Error(`NWS Forecast API error: ${response.status}`);
  }

  const data = await response.json();

  const periods = data.properties.periods.map((period: any) => {
    // Extract snow amounts from detailed forecast text
    const snowMatch = period.detailedForecast.match(
      /(?:New snow accumulation of\s*)?(\d+)\s*to\s*(\d+)\s*inch/i
    );

    return {
      name: period.name,
      detailedForecast: period.detailedForecast,
      shortForecast: period.shortForecast,
      temperature: period.temperature,
      temperatureUnit: period.temperatureUnit,
      windSpeed: period.windSpeed,
      windDirection: period.windDirection,
      startTime: period.startTime,
      endTime: period.endTime,
      snowAmount: snowMatch
        ? { low: parseInt(snowMatch[1]), high: parseInt(snowMatch[2]) }
        : undefined,
    };
  });

  return {
    updateTime: data.properties.updateTime,
    periods,
    gridId: metadata.gridId,
    gridX: metadata.gridX,
    gridY: metadata.gridY,
  };
}

/**
 * Fetch raw gridpoint data for snow amounts and QPF
 */
export async function fetchNWSGridpointData(): Promise<NWSGridpointData> {
  const metadata = await fetchNWSPointMetadata();

  const response = await fetch(metadata.forecastGridDataUrl, {
    headers: {
      "User-Agent": NWS_USER_AGENT,
      Accept: "application/geo+json",
    },
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(`NWS Gridpoint API error: ${response.status}`);
  }

  const data = await response.json();
  const props = data.properties;

  return {
    snowfallAmount: props.snowfallAmount?.values || [],
    quantitativePrecipitation: props.quantitativePrecipitation?.values || [],
    temperature: props.temperature?.values || [],
  };
}

/**
 * Extract total snow forecast from NWS point forecast
 * Combines all periods to get storm total
 */
export function extractTotalSnowFromForecast(forecast: NWSPointForecast): {
  low: number;
  high: number;
  periods: Array<{ name: string; low: number; high: number }>;
} {
  const snowPeriods: Array<{ name: string; low: number; high: number }> = [];
  let totalLow = 0;
  let totalHigh = 0;

  for (const period of forecast.periods) {
    if (period.snowAmount) {
      snowPeriods.push({
        name: period.name,
        low: period.snowAmount.low,
        high: period.snowAmount.high,
      });
      totalLow += period.snowAmount.low;
      totalHigh += period.snowAmount.high;
    }
  }

  return {
    low: totalLow,
    high: totalHigh,
    periods: snowPeriods,
  };
}
