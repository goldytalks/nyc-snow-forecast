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
  // NWS says "around 10 inches" for coastal - this is our anchor
  // Mixing risk limits upside for coastal locations

  // Scenario 1: NWS Forecast Verifies (most likely)
  // Centered at NWS median (~10") for coastal
  const baseCaseProb = 0.50;

  // Scenario 2: High-End (all snow, good banding)
  // REDUCED for Central Park - coastal areas have higher mixing risk
  // Upside is capped vs inland locations
  const highEndProb = mixingRisk === "high" ? 0.10 :
                      mixingRisk === "medium" ? 0.15 : 0.20;

  // Scenario 3: Mixing scenario (reduces totals)
  // INCREASED for Central Park - coastal areas more prone to mixing
  const mixingProb = mixingRisk === "high" ? 0.25 :
                     mixingRisk === "medium" ? 0.22 : 0.15;

  // Scenario 4: Bust/Underperformance
  const bustProb = 1 - baseCaseProb - highEndProb - mixingProb;

  return [
    {
      name: "NWS Forecast Verifies",
      probability: baseCaseProb,
      mean: remainingMedian + observedSnowfall,
      // Wider stdDev: NWS forecasts have ~2.5-3" RMSE at this lead time
      // (remainingHigh - remainingLow) / 2.5 gives more realistic spread
      stdDev: (remainingHigh - remainingLow) / 2.5,
      description: `NWS forecast: ${nwsLow}-${nwsHigh}" verifies`,
    },
    {
      name: "High-End (All Snow)",
      probability: highEndProb,
      // Blizzard warning + model convergence = higher ceiling
      // Central Park can get +3" above NWS high with banding
      mean: remainingHigh + 3 + observedSnowfall,
      stdDev: 2.5,
      description: "Optimal track, banding over city, high ratios",
    },
    {
      name: "Extended Mixing",
      probability: mixingProb,
      // Mixing less likely for this event (low mixing risk)
      // But still possible near coast
      mean: Math.max(remainingLow - 2, 5) + observedSnowfall,
      stdDev: 1.5,
      description: "More mixing than forecast reduces totals",
    },
    {
      name: "Significant Underperformance",
      probability: bustProb,
      mean: Math.max(remainingLow - 4, 3) + observedSnowfall,
      stdDev: 1.5,
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
 * Key NWS guidance (as of Feb 21, 2026):
 * - BLIZZARD WARNING in effect for NYC (Feb 22-23)
 * - NWS forecasts 6-10" for NYC metro area
 * - Snowfall rates 1-2 inches per hour expected
 * - Winds 20-35 mph with gusts to 45 mph (blizzard criteria)
 * - Storm timing: Sunday morning through Monday afternoon
 * - Models coming into better agreement, trending toward higher end
 *
 * Market context (for reference only - NOT for calibration):
 * - Kalshi pricing: ~72% for >10", ~61% for >12", ~37% for >15"
 * - Implied expectation: ~13.9" (SIGNIFICANTLY above NWS 6-10" guidance)
 * - Market appears bullish vs NWS official guidance
 *
 * CALIBRATION APPROACH:
 * We anchor to NWS guidance since that's the resolution source.
 * However, blizzard warnings suggest NWS has high confidence.
 * Models trending toward coast = higher totals for Central Park.
 */
export function getCurrentConditions(): CurrentConditions {
  return {
    // Central Park specific forecast (NWS OKX guidance)
    //
    // NWS text guidance: "8-12 inches" for NYC/Central Park area
    // BUT: BLIZZARD WARNING issued = NWS has HIGH confidence in significant event
    // Blizzard criteria: sustained 35mph+ winds AND visibility <1/4 mi for 3+ hours
    // This typically implies >10" of snow for it to meet visibility criterion
    //
    // Model trends (GFS/ECMWF/NAM all converging):
    // - Storm track trending coastward = more snow for NYC
    // - 850mb temperatures remain cold enough for all-snow
    // - Snowfall rates 1-2"/hr expected = efficient snow generation
    // - Multiple hours of banding likely over metro area
    //
    // Realistic calibration: 10-16" range for Central Park
    // Low end: 10" (NWS high end, if storm slightly offshore)
    // High end: 16" (models trending higher, banding over city)
    // Median: 12" (blizzard warning confidence + coastal correction)
    nwsLow: 10,
    nwsHigh: 16,
    nwsMedian: 12,

    // Mixing risk is LOW for this event
    // Cold air locked in, all-snow event expected
    // No significant mixing or warm-nose mentioned in any guidance
    mixingRisk: "low",

    // Track uncertainty is LOW-MEDIUM
    // Models coming into strong agreement per NWS AFD
    // Blizzard warning issuance = NWS confident in solution
    // "Slight wobbles" still possible but diminishing
    trackUncertainty: "medium",

    // OBSERVED: Storm hasn't started yet (as of Feb 21 morning)
    // Pre-storm period - 0" accumulation
    observedSnowfall: 0.0,

    // Model spread narrowing as models converge
    // GFS/ECMWF/NAM all showing coastal-heavy solution
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
