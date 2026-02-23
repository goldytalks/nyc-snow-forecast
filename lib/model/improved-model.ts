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

  // Expected additional snow on Feb 24 (counts for Kalshi but not Polymarket)
  feb24Expected: number;
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
  // As of Feb 23 ~11 AM: ~17.8" estimated on ground, storm still producing
  // Kalshi >18" at 98-99¢, >20" at 82¢ — market treats >18" as nearly certain
  // Bust/underperformance scenarios are now near-impossible

  // Scenario 1: Base case — observed ~17.8" + 1-2" remaining = ~19.5"
  const baseCaseProb = 0.55;

  // Scenario 2: High-end — continued heavy banding pushes to 22-24"
  const highEndProb = 0.20;

  // Scenario 3: Quick taper — storm winds down fast, ~18-19" total
  const taperProb = 0.20;

  // Scenario 4: Slight underperformance — observed is final total + trace
  const bustProb = 1 - baseCaseProb - highEndProb - taperProb;

  return [
    {
      name: "NWS Forecast Verifies",
      probability: baseCaseProb,
      mean: remainingMedian + observedSnowfall,
      stdDev: Math.max((remainingHigh - remainingLow) / 3.5, 1.5),
      description: `Observed ${observedSnowfall}" + moderate remaining = ~${nwsMedian}" total`,
    },
    {
      name: "High-End (All Snow)",
      probability: highEndProb,
      mean: remainingHigh + observedSnowfall,
      stdDev: 2.5,
      description: `Continued banding, observed ${observedSnowfall}" + strong remaining = ~${Math.round(remainingHigh + observedSnowfall)}" total`,
    },
    {
      name: "Quick Taper",
      probability: taperProb,
      // Storm winds down quickly, just a trace more
      mean: Math.max(observedSnowfall + remainingLow * 0.5, observedSnowfall + 0.5),
      stdDev: 1.5,
      description: `Storm tapers fast, ~${Math.round(observedSnowfall + remainingLow * 0.5)}" total`,
    },
    {
      name: "Slight Underperformance",
      probability: bustProb,
      // Observed total + trace — can't go below what's already fallen
      mean: Math.max(observedSnowfall + 0.2, observedSnowfall),
      stdDev: 1.0,
      description: `Storm done, ~${observedSnowfall}" observed + trace`,
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
 * Updated Feb 23 ~11 AM — storm still producing, significant accumulation:
 * - CLINYC Feb 22: 0.0" Feb 21 + 8.8" Feb 22 = 8.8" through Feb 22 report
 * - Feb 23: Heavy snow continued overnight and morning. Blizzard warning through 6 PM.
 * - Estimated ~9" additional on Feb 23 so far (based on NWS hourly obs + market pricing)
 * - Kalshi >18" trading at 98-99¢ = market treats >18" as virtually certain
 * - Kalshi >20" at 82¢, >24" at 9¢
 * - Total estimated: 18-22" with median ~19.5"
 */
export function getCurrentConditions(): CurrentConditions {
  return {
    // As of Feb 23 ~11 AM: storm still producing, estimated ~17.8" on ground
    // CLINYC Feb 22 report: 8.8" (0.0 Feb 21 + 8.8 Feb 22)
    // Feb 23 estimated: ~9" additional (heavy snow overnight + morning banding)
    // Total on ground: ~17.8" with storm still going
    nwsLow: 18,     // Near-certain floor given accumulation + remaining
    nwsHigh: 24,    // Continued banding could push to 24"
    nwsMedian: 19.5, // Best estimate: ~17.8 observed + 1-2" remaining today

    // Mixing risk is LOW — all-snow event confirmed
    mixingRisk: "low",

    // Track uncertainty is LOW — storm nearly over, observed data dominates
    trackUncertainty: "low",

    // OBSERVED: CLINYC 8.8" through Feb 22 + estimated ~9" Feb 23 morning
    // Feb 23 CLINYC report won't publish until Feb 24, so this is an estimate
    observedSnowfall: 17.8,

    // Model spread minimal — storm nearly over
    modelSpread: 2,

    // Feb 24 expected: trace possibility (~85% chance of 0.0", storm ends by ~6 PM Feb 23)
    // Kalshi includes Feb 24, Polymarket does not
    feb24Expected: 0.5,
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
