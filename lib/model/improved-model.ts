/**
 * Improved Snow Forecast Model
 *
 * Key improvements over the original:
 * 1. Uses Gamma distribution (right-skewed, non-negative)
 * 2. Properly models bust scenarios with mass at low end
 * 3. Calibrated to current NWS guidance
 * 4. Separate calculations for Kalshi (over/under) and Polymarket (buckets)
 */

// Gamma distribution functions
function gammaLn(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gammaPDF(x: number, shape: number, scale: number): number {
  if (x <= 0) return 0;
  const logPdf = (shape - 1) * Math.log(x) - x / scale - shape * Math.log(scale) - gammaLn(shape);
  return Math.exp(logPdf);
}

// Approximate Gamma CDF using numerical integration
function gammaCDF(x: number, shape: number, scale: number): number {
  if (x <= 0) return 0;

  // Simpson's rule integration
  const n = 1000;
  const h = x / n;
  let sum = gammaPDF(0.001, shape, scale) + gammaPDF(x, shape, scale);

  for (let i = 1; i < n; i++) {
    const xi = i * h;
    const coef = i % 2 === 0 ? 2 : 4;
    sum += coef * gammaPDF(xi, shape, scale);
  }

  return Math.min(1, (h / 3) * sum);
}

/**
 * Convert mean and standard deviation to Gamma shape and scale parameters
 */
function getGammaParams(mean: number, stdDev: number): { shape: number; scale: number } {
  // For Gamma: mean = shape * scale, variance = shape * scale^2
  // So: scale = variance / mean = stdDev^2 / mean
  //     shape = mean / scale = mean^2 / variance
  const variance = stdDev * stdDev;
  const scale = variance / mean;
  const shape = mean / scale;
  return { shape, scale };
}

export interface ImprovedScenario {
  name: string;
  probability: number;
  mean: number;
  stdDev: number;
  description: string;
}

export interface CurrentConditions {
  // NWS forecast range for Central Park
  nwsLow: number;
  nwsHigh: number;
  nwsMedian: number;

  // Confidence factors
  mixingRisk: "low" | "medium" | "high";
  trackUncertainty: "low" | "medium" | "high";

  // Already observed snow (if any)
  observedSnowfall: number;

  // Model spread (difference between highest and lowest)
  modelSpread: number;
}

/**
 * Generate scenarios based on current NWS guidance
 * Updated for Feb 21-24, 2026 forecast
 *
 * OPTIMIZED FOR CENTRAL PARK (coastal NYC location)
 *
 * Key considerations:
 * - Central Park is coastal, so mixing risk is higher
 * - NWS says "around 10 inches near the coast" - this is our anchor
 * - High-end scenarios are less likely for coastal areas
 * - Upside capped compared to inland locations
 */
export function generateImprovedScenarios(conditions: CurrentConditions): ImprovedScenario[] {
  const { nwsLow, nwsHigh, nwsMedian, mixingRisk, observedSnowfall } = conditions;

  // Remaining expected snow after observed
  const remainingMedian = Math.max(0, nwsMedian - observedSnowfall);
  const remainingLow = Math.max(0, nwsLow - observedSnowfall);
  const remainingHigh = Math.max(0, nwsHigh - observedSnowfall);

  // CENTRAL PARK CALIBRATED scenario probabilities
  // NWS AFD (Feb 22): 18-22" for NYC airports, "highest totals along coast"
  // BUT: Market is pricing >15" at only ~48% — significant skepticism
  // Mixing at 35-36°F early + NWS historically overpredicts for CP
  // NBM snow ratios "consistently too high" per NWS's own AFD

  // Scenario 1: NWS Forecast Verifies (base case)
  // Blizzard warning = high confidence event, base case dominates
  const baseCaseProb = 0.50;

  // Scenario 2: High-End (banding, high SLR)
  const highEndProb = mixingRisk === "high" ? 0.05 :
                      mixingRisk === "medium" ? 0.10 : 0.13;

  // Scenario 3: Moderate underperformance (mixing eats some totals)
  const mixingProb = mixingRisk === "high" ? 0.28 :
                     mixingRisk === "medium" ? 0.22 : 0.20;

  // Scenario 4: Significant underperformance (track miss, bust)
  const bustProb = 1 - baseCaseProb - highEndProb - mixingProb;

  return [
    {
      name: "NWS Forecast Verifies",
      probability: baseCaseProb,
      mean: remainingMedian + observedSnowfall,
      // Tighter base case — blizzard warning = NWS high confidence
      stdDev: Math.max((remainingHigh - remainingLow) / 3.5, 2.0),
      description: `NWS forecast: ${nwsLow}-${nwsHigh}" verifies`,
    },
    {
      name: "High-End (All Snow)",
      probability: highEndProb,
      // Banding over city, high SLR — but NWS notes NBM ratios too high
      mean: remainingHigh + 2 + observedSnowfall,
      stdDev: 2.5,
      description: "Optimal track, banding over city, high ratios",
    },
    {
      name: "Moderate Underperformance",
      probability: mixingProb,
      // Mixing eats some totals, NWS overpredicts by ~20%
      // With blizzard warning, storm still delivers 10-12"
      mean: Math.max(remainingLow - 1, 8) + observedSnowfall,
      stdDev: 2.0,
      description: "More mixing/lower ratios than forecast, reduced totals",
    },
    {
      name: "Significant Underperformance",
      probability: bustProb,
      // Track shifts or dry slot — still snows but well short of forecast
      mean: Math.max(remainingLow * 0.6, 5) + observedSnowfall,
      stdDev: 2.5,
      description: "Track miss, dry slot, or bust",
    },
  ];
}

/**
 * Calculate P(snow > threshold) using mixture of Gamma distributions
 */
export function calculateExceedanceProbabilityImproved(
  threshold: number,
  scenarios: ImprovedScenario[]
): number {
  let probability = 0;

  for (const scenario of scenarios) {
    // Convert to Gamma parameters
    const { shape, scale } = getGammaParams(
      Math.max(scenario.mean, 0.1), // Avoid zero/negative mean
      Math.max(scenario.stdDev, 0.1)
    );

    // P(X > threshold) = 1 - P(X <= threshold) = 1 - CDF(threshold)
    const cdf = gammaCDF(threshold, shape, scale);
    const exceedance = 1 - cdf;

    probability += scenario.probability * exceedance;
  }

  return Math.min(1, Math.max(0, probability));
}

/**
 * Calculate P(low <= snow < high) for Polymarket buckets
 */
export function calculateBucketProbability(
  low: number,
  high: number,
  scenarios: ImprovedScenario[]
): number {
  // P(low <= X < high) = P(X >= low) - P(X >= high)
  // = (1 - CDF(low)) - (1 - CDF(high))
  // = CDF(high) - CDF(low)

  const pExceedsLow = calculateExceedanceProbabilityImproved(low, scenarios);
  const pExceedsHigh = calculateExceedanceProbabilityImproved(high, scenarios);

  return Math.max(0, pExceedsLow - pExceedsHigh);
}

/**
 * Calculate all Kalshi strike probabilities
 */
export function calculateKalshiProbabilities(
  scenarios: ImprovedScenario[]
): Record<string, number> {
  const thresholds = [2, 4, 6, 8, 10, 12, 15, 18, 20, 24];
  const result: Record<string, number> = {};

  for (const threshold of thresholds) {
    result[threshold.toString()] = Math.round(
      calculateExceedanceProbabilityImproved(threshold, scenarios) * 1000
    ) / 1000;
  }

  return result;
}

/**
 * Calculate all Polymarket bucket probabilities
 */
export function calculatePolymarketProbabilities(
  scenarios: ImprovedScenario[]
): Record<string, number> {
  const buckets = [
    { name: "<4", low: 0, high: 4 },
    { name: "4-6", low: 4, high: 6 },
    { name: "6-8", low: 6, high: 8 },
    { name: "8-10", low: 8, high: 10 },
    { name: "10-12", low: 10, high: 12 },
    { name: "12-14", low: 12, high: 14 },
    { name: "14+", low: 14, high: 100 },
  ];

  const result: Record<string, number> = {};

  for (const bucket of buckets) {
    result[bucket.name] = Math.round(
      calculateBucketProbability(bucket.low, bucket.high, scenarios) * 1000
    ) / 1000;
  }

  return result;
}

/**
 * Get current conditions based on latest NWS guidance
 *
 * EVENT: February 21-24, 2026 NYC Snowstorm (Blizzard Warning)
 *
 * MARKETS:
 * - Kalshi KXSNOWSTORM-26FEBNYC2: Feb 21-24 (4 days)
 * - Polymarket: Feb 21-23 (3 days)
 *
 * RESOLUTION SOURCES (CRITICAL - these determine settlement):
 * - Kalshi: NWS Daily Climate Report (CLINYC)
 *   URL: https://forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC
 * - Polymarket: NOAA "New Snow (IN)" for NY-Central Park Area
 *   URL: https://www.weather.gov/wrh/climate?wfo=okx
 *
 * Key NWS guidance (as of Feb 22, 2026 morning):
 * - BLIZZARD WARNING in effect for NYC (Feb 22-23)
 * - NWS AFD (10:47 AM): 18-22" for JFK/LGA/EWR, "1 to 2 ft across tri-state"
 * - Snowfall rates 1-2 inches per hour expected
 * - Storm bulk: 7pm tonight through 7am Monday
 * - Currently: light snow just beginning at Central Park
 * - CLINYC reports 0.0" snowfall for Feb 21 — storm hasn't started
 *
 * RESOLUTION SOURCE (CRITICAL):
 * Kalshi settles on CLINYC (NWS Daily Climate Report for Central Park)
 * Total snowfall Feb 21-24, 2026 — "strictly greater than" threshold
 * CLINYC URL: forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC
 *
 * CALIBRATION APPROACH:
 * Anchor to NWS guidance for NYC airports (18-22") as proxy for Central Park.
 * Central Park may get slightly less than airport stations (urban heat island)
 * but the difference is typically small (1-2").
 */
export function getCurrentConditions(): CurrentConditions {
  return {
    // Central Park specific forecast (NWS OKX guidance as of Feb 22 AM)
    //
    // NWS AFD (Feb 22, 10:47 AM): 18-22" for JFK/LGA/EWR
    // "1 to 2 ft across the tri-state"
    // Storm bulk: 7pm tonight through 7am Monday
    //
    // Central Park calibration from NWS + market data:
    // - NWS airports: 18-22" but NBM snow ratios "consistently too high"
    // - Kalshi market implies median ~15" (>15" trading at ~48%)
    // - Market-implied distribution: 10th pctile ~8", median ~15", 90th ~22"
    nwsLow: 12,
    nwsHigh: 20,
    nwsMedian: 16,

    // Mixing risk is LOW for this event
    // Cold air locked in, all-snow event expected
    // AFD confirms no significant mixing concerns
    mixingRisk: "low",

    // Track uncertainty is LOW
    // Models in strong agreement, blizzard warning issued
    // NWS has high confidence
    trackUncertainty: "low",

    // OBSERVED: 0.0" as of CLINYC Feb 21 report
    // Light snow just beginning at Central Park (Feb 22 morning)
    // Trace amounts at most so far
    observedSnowfall: 0.0,

    // Model spread narrowing as models converge
    modelSpread: 3,
  };
}

/**
 * Run the improved model and return full results
 */
export function runImprovedModel() {
  const conditions = getCurrentConditions();
  const scenarios = generateImprovedScenarios(conditions);

  const kalshiProbs = calculateKalshiProbabilities(scenarios);
  const polymarketProbs = calculatePolymarketProbabilities(scenarios);

  // Calculate distribution statistics
  const mean = scenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);

  return {
    timestamp: new Date().toISOString(),
    conditions,
    scenarios: scenarios.map(s => ({
      ...s,
      probability: Math.round(s.probability * 1000) / 1000,
    })),
    distribution: {
      mean: Math.round(mean * 10) / 10,
      median: conditions.nwsMedian,
      p10: Math.round((conditions.nwsLow - 2) * 10) / 10,
      p90: Math.round((conditions.nwsHigh + 2) * 10) / 10,
    },
    kalshiProbabilities: kalshiProbs,
    polymarketProbabilities: polymarketProbs,
  };
}

// Export for testing
export { gammaCDF, getGammaParams };
