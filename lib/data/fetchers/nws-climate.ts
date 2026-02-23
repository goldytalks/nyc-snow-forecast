/**
 * NWS Climate Data Fetcher
 *
 * Fetches observed snowfall from official NWS text products:
 * - CLINYC: Daily Climate Report (settlement source for Kalshi)
 * - CF6: Preliminary Climate Data (updates more frequently)
 * - Gridpoint: Supplemental estimate from snowfallAmount data
 *
 * Fallback chain: CLINYC -> CF6 -> gridpoint estimate -> hardcoded
 */

import type { NWSGridpointData } from "./nws-api";

const NWS_USER_AGENT = "(nyc-snow-forecast, contact@example.com)";

export interface ObservedSnowfall {
  source: 'CLI' | 'CF6' | 'gridpoint' | 'hardcoded';
  totalInches: number;
  dailyBreakdown: Record<string, number>;
  lastUpdated: string;
  isComplete: boolean;
}

/**
 * Fetch the latest CLINYC (Daily Climate Report) products
 * These are the official settlement source for Kalshi
 */
async function fetchCLINYC(): Promise<ObservedSnowfall | null> {
  try {
    const url = "https://api.weather.gov/products/types/CLI/locations/NYC";
    const response = await fetch(url, {
      headers: {
        "User-Agent": NWS_USER_AGENT,
        Accept: "application/ld+json",
      },
      next: { revalidate: 900 }, // Cache 15 min
    });

    if (!response.ok) {
      console.warn(`[NWS-CLI] API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const products = data["@graph"] || [];

    if (products.length === 0) {
      console.warn("[NWS-CLI] No CLI products found");
      return null;
    }

    // Fetch the actual text of recent CLI reports
    const dailyBreakdown: Record<string, number> = {};
    let totalSnow = 0;
    let latestTime = "";
    let isComplete = false;

    // Check up to 5 most recent reports (covers Feb 21-24)
    const reportsToCheck = products.slice(0, 5);

    for (const product of reportsToCheck) {
      try {
        const productUrl = product["@id"] || product.id;
        if (!productUrl) continue;

        const productResponse = await fetch(productUrl, {
          headers: {
            "User-Agent": NWS_USER_AGENT,
            Accept: "application/ld+json",
          },
        });

        if (!productResponse.ok) continue;

        const productData = await productResponse.json();
        const text = productData.productText || "";
        const issueTime = productData.issuanceTime || "";

        if (!latestTime || issueTime > latestTime) {
          latestTime = issueTime;
        }

        // Parse date from report — look for lines like "CLIMATE REPORT FOR...02/22/2026"
        // or "...DATED 02 22 26..."
        const dateMatch = text.match(
          /(?:CLIMATE REPORT|DATED)\s*(?:FOR\s*)?.*?(\d{2})[\s/](\d{2})[\s/](\d{2,4})/i
        );
        let reportDate = "";
        if (dateMatch) {
          const month = dateMatch[1];
          const day = dateMatch[2];
          reportDate = `Feb ${parseInt(day)}`;
        }

        // Parse snowfall — look for patterns like:
        // "SNOW               8.8    0.0    8.8"
        // "SNOWFALL (IN)       8.8"
        // "SNOW...8.8"
        const snowPatterns = [
          /SNOW\s+(\d+\.?\d*)\s/,
          /SNOWFALL\s*\(?IN\)?\s*\.{0,3}\s*(\d+\.?\d*)/i,
          /SNOW\s*\.{3,}\s*(\d+\.?\d*)/i,
          // Table format: SNOW followed by numbers
          /SNOW\s+(?:T|0\.0|\d+\.?\d*)\s+(?:T|0\.0|\d+\.?\d*)\s+(\d+\.?\d*)/,
        ];

        for (const pattern of snowPatterns) {
          const match = text.match(pattern);
          if (match) {
            const snowValue = parseFloat(match[1]);
            if (!isNaN(snowValue) && snowValue >= 0 && reportDate) {
              dailyBreakdown[reportDate] = snowValue;
              break;
            }
          }
        }

        // Also try to parse the full snow line with today/month/season values
        // Format: "SNOW               8.8    0.0    8.8   41.3"
        const fullSnowLine = text.match(
          /SNOW\s+(T|\d+\.?\d*)\s+(T|\d+\.?\d*)\s+(T|\d+\.?\d*)/
        );
        if (fullSnowLine && reportDate) {
          const todaySnow = fullSnowLine[1] === "T" ? 0.0 : parseFloat(fullSnowLine[1]);
          if (!isNaN(todaySnow)) {
            dailyBreakdown[reportDate] = todaySnow;
          }
        }

        // Check if this is a complete report (indicates storm is over for that day)
        if (text.includes("MIDNIGHT") || text.includes("12 AM")) {
          isComplete = true;
        }
      } catch (err) {
        console.warn("[NWS-CLI] Error parsing product:", err);
        continue;
      }
    }

    // Sum daily breakdown
    totalSnow = Object.values(dailyBreakdown).reduce((sum, v) => sum + v, 0);

    if (totalSnow === 0 && Object.keys(dailyBreakdown).length === 0) {
      return null;
    }

    return {
      source: "CLI",
      totalInches: Math.round(totalSnow * 10) / 10,
      dailyBreakdown,
      lastUpdated: latestTime || new Date().toISOString(),
      isComplete,
    };
  } catch (error) {
    console.error("[NWS-CLI] Fetch error:", error);
    return null;
  }
}

/**
 * Fetch CF6 (Preliminary Climate Data) for NYC
 * Updates more frequently than CLI during active weather
 */
async function fetchCF6(): Promise<ObservedSnowfall | null> {
  try {
    const url = "https://api.weather.gov/products/types/CF6/locations/NYC";
    const response = await fetch(url, {
      headers: {
        "User-Agent": NWS_USER_AGENT,
        Accept: "application/ld+json",
      },
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      console.warn(`[NWS-CF6] API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const products = data["@graph"] || [];

    if (products.length === 0) {
      console.warn("[NWS-CF6] No CF6 products found");
      return null;
    }

    // Fetch the most recent CF6 product
    const latestProduct = products[0];
    const productUrl = latestProduct["@id"] || latestProduct.id;
    if (!productUrl) return null;

    const productResponse = await fetch(productUrl, {
      headers: {
        "User-Agent": NWS_USER_AGENT,
        Accept: "application/ld+json",
      },
    });

    if (!productResponse.ok) return null;

    const productData = await productResponse.json();
    const text = productData.productText || "";
    const issueTime = productData.issuanceTime || "";

    // CF6 has a tabular format with columns:
    // DY MN MX AV ...  SN  ...
    // 21 34 28 31 ...  0.0 ...
    // 22 30 26 28 ...  8.8 ...
    // 23 28 25 27 ... 10.5 ...
    //
    // Parse the snow column (usually column ~14 or after WX)
    const dailyBreakdown: Record<string, number> = {};
    let totalSnow = 0;

    // Find the header line to locate the SN column
    const lines = text.split("\n");
    let snColumnIndex = -1;
    let headerFound = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for header with SN (snow) column
      if (line.match(/\bDY\b/) && line.match(/\bSN\b/)) {
        // Find position of SN in the header
        const headers = line.trim().split(/\s+/);
        snColumnIndex = headers.indexOf("SN");
        headerFound = true;
        continue;
      }

      // Parse data lines (start with day number 1-31)
      if (headerFound && snColumnIndex >= 0) {
        const trimmed = line.trim();
        const dayMatch = trimmed.match(/^(\d{1,2})\s/);
        if (dayMatch) {
          const day = parseInt(dayMatch[1]);
          // Only interested in Feb 21-24
          if (day >= 21 && day <= 24) {
            const columns = trimmed.split(/\s+/);
            if (columns.length > snColumnIndex) {
              const snowStr = columns[snColumnIndex];
              const snowVal =
                snowStr === "T"
                  ? 0.0
                  : snowStr === "M"
                    ? NaN
                    : parseFloat(snowStr);
              if (!isNaN(snowVal)) {
                dailyBreakdown[`Feb ${day}`] = snowVal;
                totalSnow += snowVal;
              }
            }
          }
        }
      }
    }

    if (totalSnow === 0 && Object.keys(dailyBreakdown).length === 0) {
      return null;
    }

    return {
      source: "CF6",
      totalInches: Math.round(totalSnow * 10) / 10,
      dailyBreakdown,
      lastUpdated: issueTime || new Date().toISOString(),
      isComplete: !!dailyBreakdown["Feb 24"],
    };
  } catch (error) {
    console.error("[NWS-CF6] Fetch error:", error);
    return null;
  }
}

/**
 * Estimate observed snowfall from gridpoint snowfallAmount data
 * Uses periods that have already ended (validTime end < now)
 */
function estimateFromGridpoint(gridData: NWSGridpointData): ObservedSnowfall | null {
  try {
    if (!gridData.snowfallAmount?.length) return null;

    const now = new Date();
    let totalMm = 0;
    const dailyMm: Record<string, number> = {};

    for (const period of gridData.snowfallAmount) {
      if (period.value === null || period.value <= 0) continue;

      // Parse ISO 8601 duration format: "2026-02-22T06:00:00+00:00/PT6H"
      const parts = period.validTime.split("/");
      if (parts.length < 2) continue;

      const startTime = new Date(parts[0]);
      // Parse duration
      const durationMatch = parts[1].match(/PT(\d+)H/);
      if (!durationMatch) continue;

      const hours = parseInt(durationMatch[1]);
      const endTime = new Date(startTime.getTime() + hours * 3600000);

      // Only count periods that have ended (observed, not forecast)
      if (endTime > now) continue;

      // Only count Feb 21-24 range
      const day = startTime.getUTCDate();
      const month = startTime.getUTCMonth(); // 0-indexed, Feb = 1
      if (month !== 1 || day < 21 || day > 24) continue;

      totalMm += period.value;
      const dateKey = `Feb ${day}`;
      dailyMm[dateKey] = (dailyMm[dateKey] || 0) + period.value;
    }

    if (totalMm === 0) return null;

    // Convert mm to inches
    const totalInches = Math.round((totalMm / 25.4) * 10) / 10;
    const dailyBreakdown: Record<string, number> = {};
    for (const [key, mm] of Object.entries(dailyMm)) {
      dailyBreakdown[key] = Math.round((mm / 25.4) * 10) / 10;
    }

    return {
      source: "gridpoint",
      totalInches,
      dailyBreakdown,
      lastUpdated: now.toISOString(),
      isComplete: false,
    };
  } catch (error) {
    console.error("[NWS-Gridpoint] Estimation error:", error);
    return null;
  }
}

/**
 * Fetch observed snowfall using fallback chain:
 * CLINYC -> CF6 -> gridpoint estimate -> hardcoded fallback
 */
export async function fetchObservedSnowfall(
  gridData?: NWSGridpointData
): Promise<ObservedSnowfall> {
  // Try CLINYC first (official settlement source)
  const cliResult = await fetchCLINYC();
  if (cliResult && cliResult.totalInches > 0) {
    console.log(`[Observed] Using CLI: ${cliResult.totalInches}" (${JSON.stringify(cliResult.dailyBreakdown)})`);
    return cliResult;
  }

  // Try CF6 next (more frequent updates)
  const cf6Result = await fetchCF6();
  if (cf6Result && cf6Result.totalInches > 0) {
    console.log(`[Observed] Using CF6: ${cf6Result.totalInches}" (${JSON.stringify(cf6Result.dailyBreakdown)})`);
    return cf6Result;
  }

  // Try gridpoint estimate
  if (gridData) {
    const gridResult = estimateFromGridpoint(gridData);
    if (gridResult && gridResult.totalInches > 0) {
      console.log(`[Observed] Using gridpoint estimate: ${gridResult.totalInches}"`);
      return gridResult;
    }
  }

  // Hardcoded fallback — best estimate as of Feb 23 ~1:30 PM
  // 15.1" at 7 AM + ~4-5" more through afternoon
  console.log("[Observed] Using hardcoded fallback: 19.5\"");
  return {
    source: "hardcoded",
    totalInches: 19.5,
    dailyBreakdown: {
      "Feb 21": 0.0,
      "Feb 22": 8.8,
      "Feb 23": 10.7,
    },
    lastUpdated: new Date().toISOString(),
    isComplete: false,
  };
}

export type { NWSGridpointData };
