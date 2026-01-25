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
 * Updated for Jan 25, 2026 - STORM IN PROGRESS
 *
 * The storm is now underway and performing at/above expectations.
 * Mixing risk has diminished as cold air is holding.
 * Market pricing (~86% for >10") reflects strong performance.
 */
export function generateImprovedScenarios(conditions: CurrentConditions): ImprovedScenario[] {
  const { nwsLow, nwsHigh, nwsMedian, mixingRisk, observedSnowfall } = conditions;

  // Remaining expected snow after observed
  const remainingMedian = Math.max(0, nwsMedian - observedSnowfall);
  const remainingLow = Math.max(0, nwsLow - observedSnowfall);
  const remainingHigh = Math.max(0, nwsHigh - observedSnowfall);

  // UPDATED SCENARIO PROBABILITIES - Jan 25
  // Storm is performing well, mixing risk has diminished
  // Markets are pricing ~86% chance of >10"

  // Scenario 1: NWS Forecast Verifies (most likely)
  // Centered at upgraded NWS median (12")
  const baseCaseProb = 0.55;

  // Scenario 2: High-End (all snow, good banding)
  // INCREASED - mixing risk is low, storm tracking colder
  const highEndProb = mixingRisk === "high" ? 0.12 :
                      mixingRisk === "medium" ? 0.18 : 0.25;

  // Scenario 3: Mixing scenario (reduces totals)
  // DECREASED - cold air holding better than expected
  const mixingProb = mixingRisk === "high" ? 0.20 :
                     mixingRisk === "medium" ? 0.15 : 0.10;

  // Scenario 4: Bust/Underperformance (rare at this point)
  const bustProb = 1 - baseCaseProb - highEndProb - mixingProb;

  return [
    {
      name: "NWS Forecast Verifies",
      probability: baseCaseProb,
      mean: nwsMedian, // Full NWS median
      stdDev: (nwsHigh - nwsLow) / 3,
      description: `NWS forecast: ${nwsLow}-${nwsHigh}" verifies`,
    },
    {
      name: "High-End (All Snow)",
      probability: highEndProb,
      // Storm overperforms - good snow banding
      mean: nwsHigh + 2,
      stdDev: 2.0,
      description: "Optimal banding, high ratios, overperformance",
    },
    {
      name: "Extended Mixing",
      probability: mixingProb,
      // Some mixing late - reduces totals slightly
      mean: Math.max(nwsLow - 1, 8),
      stdDev: 1.5,
      description: "Late mixing reduces final totals",
    },
    {
      name: "Significant Underperformance",
      probability: bustProb,
      mean: Math.max(nwsLow - 3, 6),
      stdDev: 1.5,
      description: "Unexpected dry slot or mixing",
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
 * Get current conditions based on latest NWS guidance (Jan 25, 2026)
 *
 * CRITICAL: Calibrated for NY CITY CENTRAL PARK
 * Resolution source: weather.gov/wrh/climate?wfo=okx (CLINYC station)
 *
 * UPDATED Jan 25: Storm is in progress and performing well.
 * NWS guidance (latest):
 * - Winter Storm Warning: 10-15 inches for NYC metro
 * - Heavy snow bands setting up over the city
 * - Current model consensus: 12-14" for Central Park
 * - Market pricing: ~86% chance of >10" (Kalshi NO at 14c)
 *
 * Storm performance so far is tracking to the higher end of guidance.
 */
export function getCurrentConditions(): CurrentConditions {
  return {
    // UPDATED: NWS upgraded forecast - now expecting 10-15" for NYC
    nwsLow: 10,
    nwsHigh: 15,
    nwsMedian: 12, // Upgraded from 10" to 12" as storm performs well

    // Mixing risk is now LOW - storm tracking colder than expected
    // Coastal mixing threat has diminished
    mixingRisk: "low",

    // Track uncertainty is low - models in good agreement
    trackUncertainty: "low",

    // OBSERVED: Update with latest accumulation
    // Check: weather.gov/wrh/climate?wfo=okx for official totals
    observedSnowfall: 0.5, // Light snow overnight

    // Model spread has narrowed
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
