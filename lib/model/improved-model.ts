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
  // NWS AFD (Feb 22, 3:32 PM): "20-24 inches for NYC and Long Island"
  // "Isolated 30 inches possible in heaviest banding, mainly along coast"
  // Storm is ACTIVELY HAPPENING — heavy snow phase imminent (~7pm)
  // 2-3"/hr rates expected, blizzard conditions through Monday AM
  // Market: >15" at 58-59c, >24" at 10-11c

  // Scenario 1: NWS Forecast Verifies (base case)
  // Storm is happening, NWS very confident, base case dominates
  const baseCaseProb = 0.48;

  // Scenario 2: High-End (banding, 30" possible per NWS)
  // NWS explicitly mentions 30" possible along coast = CP
  const highEndProb = mixingRisk === "high" ? 0.05 :
                      mixingRisk === "medium" ? 0.08 : 0.12;

  // Scenario 3: Moderate underperformance (lower ratios, less banding)
  // NWS historically overpredicts — significant probability of 12-16" instead of 20-24"
  const mixingProb = mixingRisk === "high" ? 0.28 :
                     mixingRisk === "medium" ? 0.24 : 0.22;

  // Scenario 4: Significant underperformance (dry slot, unexpected mixing)
  // Less likely since storm is underway, but NWS can still significantly miss
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
      // NWS says "isolated 30 inches possible" along coast
      // Banding over city, high SLR, 2-3"/hr rates sustained
      mean: remainingHigh + 4 + observedSnowfall,
      stdDev: 3.0,
      description: "Banding over city, 30\" possible per NWS",
    },
    {
      name: "Moderate Underperformance",
      probability: mixingProb,
      // Storm delivers but at lower end — 14-16" instead of 20-24"
      // Lower SLR or less banding than forecast
      mean: Math.max(remainingLow * 0.85, 12) + observedSnowfall,
      stdDev: 2.0,
      description: "Lower ratios/less banding than forecast, 14-16\" range",
    },
    {
      name: "Significant Underperformance",
      probability: bustProb,
      // Unexpected dry slot or mixing — still snows but well short
      // Floor is ~8-10" since storm is underway and can't fully bust
      mean: Math.max(remainingLow * 0.6, 8) + observedSnowfall,
      stdDev: 2.5,
      description: "Dry slot or unexpected mixing, well short of forecast",
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
  const thresholds = [2, 4, 6, 8, 10, 12, 14, 15, 16, 18, 20, 24];
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
 * Key NWS guidance (as of Feb 22, 2026 3:32 PM):
 * - BLIZZARD WARNING in effect for NYC (Feb 22-23)
 * - NWS AFD (3:32 PM): "20 to 24 inches for NYC and Long Island"
 * - "Isolated 30 inches possible in heaviest banding, mainly along coast"
 * - Snowfall rates 2-3 inches per hour expected in heavy bands
 * - Storm bulk: 7pm tonight through Monday morning
 * - Currently: light snow falling, ~1-2" accumulated, heavy snow imminent
 * - CLINYC Feb 21: 0.0" (storm hadn't started)
 *
 * RESOLUTION SOURCE (CRITICAL):
 * Kalshi settles on CLINYC (NWS Daily Climate Report for Central Park)
 * Total snowfall Feb 21-24, 2026 — "strictly greater than" threshold
 * CLINYC URL: forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC
 *
 * CALIBRATION APPROACH:
 * NWS AFD upgraded to 20-24" for NYC, but NWS historically overpredicts by ~15-20%.
 * Apply ~10% discount: 14-22" range for Central Park with median ~18".
 * Market-implied median ~16-17" — model anchors between NWS and market.
 */
export function getCurrentConditions(): CurrentConditions {
  return {
    // Central Park specific forecast (NWS OKX guidance as of Feb 22 PM)
    //
    // NWS AFD (Feb 22, 3:32 PM): "20 to 24 inches of snow for NYC and Long Island"
    // "Isolated readings of 30 inches possible in heaviest banding, mainly along coast"
    // Snowfall rates 2-3 inches per hour expected in heavy bands
    // Storm bulk: 7pm tonight through Monday morning
    // Currently: light snow falling, heavy snow starts ~7pm
    //
    // NWS says 20-24" but historically overpredicts by ~15-20%
    // Market-implied median ~16-17" (>15" at 58.5c, >20" would be ~30-35c)
    // Split the difference: anchor to 14-22" for Central Park
    nwsLow: 14,
    nwsHigh: 22,
    nwsMedian: 18,

    // Mixing risk is LOW for this event
    // Cold air locked in, all-snow event expected
    // 31°F at Central Park, dropping further tonight
    mixingRisk: "low",

    // Track uncertainty is VERY LOW
    // Storm is actively happening, blizzard warning in effect
    // NWS has very high confidence — white-out conditions expected
    trackUncertainty: "low",

    // OBSERVED: ~1-2" as of 4pm Feb 22
    // Light snow since morning, heavy snow starts ~7pm
    // CLINYC Feb 21 report: 0.0" (storm hadn't started)
    observedSnowfall: 1.5,

    // Model spread minimal — storm is happening
    modelSpread: 2,
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
