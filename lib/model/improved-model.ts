/**
 * Improved Snow Forecast Model
 *
 * Key improvements over the original:
 * 1. Uses Gamma distribution (right-skewed, non-negative)
 * 2. Properly models bust scenarios with mass at low end
 * 3. Calibrated to current NWS guidance
 * 4. Separate calculations for Kalshi (over/under) and Polymarket (buckets)
 */

import type { UnifiedForecastData } from "../data/fetchers";

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

  // Expected additional snow on Feb 24 (counts for Kalshi but not Polymarket)
  feb24Expected: number;

  // CLINYC measurement bias: ratio of official CLINYC total to "true" snowfall
  // >1.0 means CLINYC reads higher (6-hr board clearing captures pre-compaction snow)
  // <1.0 means CLINYC reads lower (wind undercatch at exposed Belvedere Castle site)
  // For a high-wind blizzard, wind undercatch (10-30%) likely dominates the
  // compaction benefit (~5-15%), net effect is slight undermeasurement
  measurementBias: number;
  // Additional measurement uncertainty (stddev of the bias, in inches)
  measurementUncertainty: number;
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
  const { nwsLow, nwsHigh, nwsMedian, observedSnowfall, measurementBias, measurementUncertainty } = conditions;

  // Remaining expected snow after observed
  const remainingMedian = Math.max(0, nwsMedian - observedSnowfall);
  const remainingLow = Math.max(0, nwsLow - observedSnowfall);
  const remainingHigh = Math.max(0, nwsHigh - observedSnowfall);

  // CENTRAL PARK CALIBRATED scenario probabilities
  // As of Feb 23 afternoon: ~19.5" estimated on ground, storm still producing
  // Kalshi >18" at 98-99¢, >20" at 82¢ — market treats >18" as nearly certain
  // Bust/underperformance scenarios are now near-impossible

  // Scenario 1: Base case — observed + moderate remaining
  const baseCaseProb = 0.55;

  // Scenario 2: High-end — continued heavy banding
  const highEndProb = 0.20;

  // Scenario 3: Quick taper — storm winds down fast
  const taperProb = 0.20;

  // Scenario 4: Slight underperformance — observed is nearly final total
  const bustProb = 1 - baseCaseProb - highEndProb - taperProb;

  // MEASUREMENT ADJUSTMENT: Kalshi/Polymarket settle on CLINYC, not "true" snowfall.
  // The CLINYC measurement has systematic biases:
  //   - 6-hr board clearing: captures pre-compaction snow (+5-10%)
  //   - Wind undercatch at exposed Belvedere Castle: loses snow in high winds (-10-20%)
  //   - Net: ~7% undermeasurement in a high-wind blizzard (measurementBias = 0.93)
  // Apply bias to scenario means and add measurement uncertainty to stddev.
  const applyMeasurement = (trueMean: number, trueStdDev: number) => ({
    mean: Math.round(trueMean * measurementBias * 10) / 10,
    stdDev: Math.round(Math.sqrt(trueStdDev ** 2 + measurementUncertainty ** 2) * 10) / 10,
  });

  const baseCase = applyMeasurement(remainingMedian + observedSnowfall, Math.max((remainingHigh - remainingLow) / 3.5, 1.5));
  const highEnd = applyMeasurement(remainingHigh + observedSnowfall, 2.5);
  const taper = applyMeasurement(Math.max(observedSnowfall + remainingLow * 0.5, observedSnowfall + 0.5), 1.5);
  const bust = applyMeasurement(Math.max(observedSnowfall + 0.2, observedSnowfall), 1.0);

  return [
    {
      name: "NWS Forecast Verifies",
      probability: baseCaseProb,
      mean: baseCase.mean,
      stdDev: baseCase.stdDev,
      description: `CLINYC measured: ~${baseCase.mean}" (true ~${nwsMedian}" x ${measurementBias} bias)`,
    },
    {
      name: "High-End (All Snow)",
      probability: highEndProb,
      mean: highEnd.mean,
      stdDev: highEnd.stdDev,
      description: `CLINYC measured: ~${highEnd.mean}" (true ~${Math.round(remainingHigh + observedSnowfall)}" x ${measurementBias} bias)`,
    },
    {
      name: "Quick Taper",
      probability: taperProb,
      mean: taper.mean,
      stdDev: taper.stdDev,
      description: `CLINYC measured: ~${taper.mean}" (storm tapers fast)`,
    },
    {
      name: "Slight Underperformance",
      probability: bustProb,
      mean: bust.mean,
      stdDev: bust.stdDev,
      description: `CLINYC measured: ~${bust.mean}" (storm done + trace)`,
    },
  ];
}

/**
 * Generate Polymarket-specific scenarios (Feb 21-23, excludes Feb 24)
 * Shifts means down by feb24Expected since Polymarket settles on 3-day total
 */
export function generatePolymarketScenarios(conditions: CurrentConditions): ImprovedScenario[] {
  const kalshiScenarios = generateImprovedScenarios(conditions);
  return kalshiScenarios.map(s => ({
    ...s,
    mean: Math.max(s.mean - conditions.feb24Expected, 0.1),
  }));
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
  const thresholds = [2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 24];
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
    { name: "<8", low: 0, high: 8 },
    { name: "8-10", low: 8, high: 10 },
    { name: "10-12", low: 10, high: 12 },
    { name: "12-14", low: 12, high: 14 },
    { name: "14-16", low: 14, high: 16 },
    { name: "16-18", low: 16, high: 18 },
    { name: "18-20", low: 18, high: 20 },
    { name: "20+", low: 20, high: 100 },
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
 * MARKETS & RESOLUTION (CRITICAL — different dates and sources!):
 *
 * KALSHI (KXSNOWSTORM-26FEBNYC2):
 * - Date range: Feb 21-24, 2026 (4 days)
 * - Source: NWS Daily Climate Report (CLINYC) for Central Park
 * - URL: https://forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC
 * - Settlement: "Strictly greater than" threshold = YES (directional)
 *
 * POLYMARKET:
 * - Date range: Feb 21-23, 2026 (3 days — EXCLUDES Feb 24!)
 * - Source: NOAA "New Snow (IN)" for NY-Central Park Area
 * - URL: https://www.weather.gov/wrh/climate?wfo=okx
 * - Settlement: Bracket-based. Falls between brackets → resolves to higher bracket.
 *
 * Updated Feb 23 ~11 AM — storm still producing heavy snow:
 *
 * HARD DATA:
 * - CLINYC Feb 22 report: 0.0" Feb 21 + 8.8" Feb 22 = 8.8"
 * - NWS storm total at 7 AM Feb 23: 15.1" (per ABC7, Fox5, amNY)
 * - Snow still falling at up to 3"/hr in heavy bands as of 7:28 AM
 * - Blizzard warning in effect through 6 PM Feb 23
 *
 * ESTIMATE for ~11 AM:
 * - 15.1" at 7 AM + ~3-4 hours of continued moderate-heavy snow
 * - Estimated 2-4" additional since 7 AM → ~17-19" on ground now
 * - Storm expected to taper by late afternoon
 *
 * MARKET CHECK:
 * - Kalshi >18" at 98-99¢, >20" at 82¢, >24" at 9¢
 */
export function getCurrentConditions(data?: UnifiedForecastData): CurrentConditions {
  // HARD FLOOR: NWS confirmed 15.1" at 7 AM Feb 23, storm continued through afternoon.
  // CLI/CF6 reports lag (Feb 23 CLI won't exist until after midnight), so live fetchers
  // may return incomplete data (e.g. only Feb 22's 8.8"). Never go below known truth.
  const OBSERVED_FLOOR = 19.5; // 15.1" at 7AM + ~4" more through afternoon
  const NWS_LOW_FLOOR = 18;
  const NWS_HIGH_FLOOR = 24;

  // Use live observed snowfall if available AND it exceeds our known floor
  const liveObserved = data?.observedSnowfall?.totalInches ?? 0;
  const observedSnowfall = Math.max(liveObserved, OBSERVED_FLOOR);

  // Derive NWS range: observed is the natural floor, remaining snow adds upside
  // Also enforce absolute minimums since NWS API returns REMAINING snow (not total)
  const nwsLow = Math.max(data?.combined?.snowfallRange?.low ?? NWS_LOW_FLOOR, observedSnowfall + 0.5, NWS_LOW_FLOOR);
  const nwsHigh = Math.max(data?.combined?.snowfallRange?.high ?? NWS_HIGH_FLOOR, observedSnowfall + 3, NWS_HIGH_FLOOR);
  const nwsMedian = Math.round(((nwsLow + nwsHigh) / 2) * 10) / 10;

  return {
    nwsLow,
    nwsHigh,
    nwsMedian,

    // Mixing risk is LOW — all-snow event confirmed
    mixingRisk: "low",

    // Track uncertainty is LOW — storm nearly over, observed data dominates
    trackUncertainty: "low",

    observedSnowfall,

    // Model spread minimal — storm nearly over
    modelSpread: 2,

    // Feb 24 expected: trace possibility (~85% chance of 0.0", storm ends by ~6 PM Feb 23)
    // Kalshi includes Feb 24, Polymarket does not
    feb24Expected: 0.5,

    // CLINYC measurement bias for this storm:
    // Compaction benefit: +5-10% (6-hr board clearing captures pre-compaction snow)
    // Wind undercatch: -10-20% (Belvedere Castle is exposed hilltop, 50+ mph gusts)
    // Net: ~5-10% undermeasurement in a high-wind blizzard
    // 0.93 means CLINYC will report ~93% of "true" snowfall
    measurementBias: 0.93,
    // Uncertainty in the measurement itself (~1" stddev)
    measurementUncertainty: 1.0,
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
