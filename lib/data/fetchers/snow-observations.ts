/**
 * Live Snow Observation Fetcher
 * Automatically scans for latest official Central Park snowfall measurements
 *
 * Sources:
 * 1. NWS Public Information Statement (PNS) - official storm reports
 * 2. NWS Local Storm Reports (LSR)
 * 3. Direct station observations
 */

export interface SnowObservation {
  location: string;
  amount: number;
  timestamp: string;
  source: "PNS" | "LSR" | "STATION" | "ESTIMATED";
  isOfficial: boolean;
  rawText?: string;
}

export interface CentralParkSnowData {
  observed: number;
  observedTime: string;
  source: string;
  isOfficial: boolean;
  lastChecked: string;
  allReports: SnowObservation[];
}

const NWS_USER_AGENT = "(nyc-snow-forecast, contact@example.com)";

/**
 * Fetch NWS Public Information Statement for latest snow reports
 */
async function fetchNWSPNS(): Promise<string | null> {
  try {
    const response = await fetch(
      "https://forecast.weather.gov/product.php?site=NWS&product=PNS&issuedby=OKX&format=txt",
      {
        headers: { "User-Agent": NWS_USER_AGENT },
        next: { revalidate: 300 }, // Cache 5 minutes
      }
    );
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    console.error("[SnowObs] Failed to fetch PNS:", e);
    return null;
  }
}

/**
 * Fetch NWS Local Storm Reports
 */
async function fetchNWSLSR(): Promise<string | null> {
  try {
    const response = await fetch(
      "https://forecast.weather.gov/product.php?site=NWS&product=LSR&issuedby=OKX&format=txt",
      {
        headers: { "User-Agent": NWS_USER_AGENT },
        next: { revalidate: 300 },
      }
    );
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    console.error("[SnowObs] Failed to fetch LSR:", e);
    return null;
  }
}

/**
 * Parse snow amounts from NWS text products
 * Looks for Central Park / NYC / Manhattan reports
 */
function parseSnowReports(text: string, source: "PNS" | "LSR"): SnowObservation[] {
  const observations: SnowObservation[] = [];
  const lines = text.split("\n");

  // Patterns to match snow reports
  // Example: "CENTRAL PARK          7.2   0100 PM  01/25  OFFICIAL NWS OBS"
  // Example: "NYC/CENTRAL PARK     7.2 INCHES  STORM TOTAL"
  const patterns = [
    // Official NWS observation format
    /CENTRAL\s*PARK[^\d]*(\d+\.?\d*)\s*(INCH|IN|")?.*?((\d{1,2}):?(\d{2})\s*(AM|PM))?/i,
    // Storm total format
    /CENTRAL\s*PARK.*?(\d+\.?\d*)\s*(INCH|IN|")/i,
    // NYC format
    /NYC.*?CENTRAL.*?(\d+\.?\d*)\s*(INCH|IN|")/i,
    // Manhattan format with amount
    /MANHATTAN.*?(\d+\.?\d*)\s*(INCH|IN|")/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();

    // Check if line mentions Central Park
    if (line.includes("CENTRAL PARK") || (line.includes("NYC") && line.includes("MANHATTAN"))) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const amount = parseFloat(match[1]);
          if (amount > 0 && amount < 50) { // Sanity check
            // Try to extract time
            const timeMatch = line.match(/(\d{1,2}):?(\d{2})\s*(AM|PM)/i);
            let timestamp = new Date().toISOString();
            if (timeMatch) {
              const hours = parseInt(timeMatch[1]) + (timeMatch[3].toUpperCase() === "PM" && timeMatch[1] !== "12" ? 12 : 0);
              const mins = parseInt(timeMatch[2]);
              const now = new Date();
              now.setHours(hours, mins, 0, 0);
              timestamp = now.toISOString();
            }

            observations.push({
              location: "Central Park",
              amount,
              timestamp,
              source,
              isOfficial: line.includes("OFFICIAL") || line.includes("NWS OBS"),
              rawText: line.trim(),
            });
          }
        }
      }
    }
  }

  return observations;
}

/**
 * Get the latest Central Park snow observation
 * Combines multiple sources and returns the most recent/reliable
 */
export async function getLatestCentralParkSnow(): Promise<CentralParkSnowData> {
  const allReports: SnowObservation[] = [];
  const now = new Date().toISOString();

  // Fetch from multiple sources in parallel
  const [pnsText, lsrText] = await Promise.all([
    fetchNWSPNS(),
    fetchNWSLSR(),
  ]);

  // Parse PNS reports
  if (pnsText) {
    const pnsReports = parseSnowReports(pnsText, "PNS");
    allReports.push(...pnsReports);
  }

  // Parse LSR reports
  if (lsrText) {
    const lsrReports = parseSnowReports(lsrText, "LSR");
    allReports.push(...lsrReports);
  }

  // Sort by timestamp (newest first) and prefer official reports
  allReports.sort((a, b) => {
    // Official reports first
    if (a.isOfficial && !b.isOfficial) return -1;
    if (!a.isOfficial && b.isOfficial) return 1;
    // Then by timestamp
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  // Get the best observation
  if (allReports.length > 0) {
    const best = allReports[0];
    console.log(`[SnowObs] Found ${allReports.length} reports. Best: ${best.amount}" from ${best.source} at ${best.timestamp}`);
    return {
      observed: best.amount,
      observedTime: best.timestamp,
      source: best.source,
      isOfficial: best.isOfficial,
      lastChecked: now,
      allReports,
    };
  }

  // Fallback: estimate based on time and known data points
  // 7.2" at 1 PM, sleet started ~3 PM
  // Estimate ~1"/hr until sleet, then minimal
  const fallbackEstimate = estimateCurrentSnowfall();
  console.log(`[SnowObs] No reports found. Using estimate: ${fallbackEstimate}"`);

  return {
    observed: fallbackEstimate,
    observedTime: now,
    source: "ESTIMATED",
    isOfficial: false,
    lastChecked: now,
    allReports: [{
      location: "Central Park",
      amount: fallbackEstimate,
      timestamp: now,
      source: "ESTIMATED",
      isOfficial: false,
    }],
  };
}

/**
 * Estimate current snowfall based on known data points
 * Used as fallback when no official reports available
 */
function estimateCurrentSnowfall(): number {
  // Known data point: 7.2" at 1:00 PM ET on Jan 25, 2026
  const knownAmount = 7.2;
  const knownTime = new Date("2026-01-25T18:00:00Z"); // 1 PM ET = 6 PM UTC

  // Sleet transition started ~3 PM ET
  const sleetStartTime = new Date("2026-01-25T20:00:00Z"); // 3 PM ET = 8 PM UTC

  const now = new Date();

  // Calculate additional snow
  // Before sleet: ~1-2"/hr
  // After sleet: minimal (~0.1"/hr as sleet doesn't count)

  const hoursBeforeSleet = Math.max(0, (sleetStartTime.getTime() - knownTime.getTime()) / 3600000);
  const hoursAfterSleet = Math.max(0, (now.getTime() - sleetStartTime.getTime()) / 3600000);

  const additionalBeforeSleet = hoursBeforeSleet * 1.0; // ~1"/hr
  const additionalAfterSleet = hoursAfterSleet * 0.1; // minimal during sleet

  const estimate = knownAmount + additionalBeforeSleet + additionalAfterSleet;

  // Cap at reasonable maximum (NWS high end)
  return Math.min(estimate, 12);
}

/**
 * Format observation for display
 */
export function formatObservation(data: CentralParkSnowData): string {
  const timeStr = new Date(data.observedTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

  if (data.isOfficial) {
    return `${data.observed}" official @ ${timeStr} (${data.source})`;
  } else if (data.source === "ESTIMATED") {
    return `~${data.observed}" estimated (last official: 7.2" @ 1PM)`;
  } else {
    return `${data.observed}" reported @ ${timeStr} (${data.source})`;
  }
}
