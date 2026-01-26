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

  // CRITICAL: Account for snow already on ground
  // 7.2" already measured - scenarios should reflect FINAL totals
  // Remaining precip will be mix of snow/sleet

  // UPDATED SCENARIO PROBABILITIES - Jan 25, 3:44 PM ET
  // Sleet is ACTIVELY FALLING - warm nose at 750mb confirmed
  // NWS says up to 1" sleet on top of snow (doesn't count toward total)
  // Snow returns after 10 PM but at lighter rates

  // Scenario 1: NWS Forecast Verifies (8-12" range)
  // Most likely outcome given current mixing
  const baseCaseProb = 0.50;

  // Scenario 2: High-End - requires mixing to be brief
  // REDUCED because mixing is actively happening
  const highEndProb = mixingRisk === "high" ? 0.15 :
                      mixingRisk === "medium" ? 0.20 : 0.25;

  // Scenario 3: Extended Mixing - sleet limits totals
  // INCREASED because sleet is falling NOW
  const mixingProb = mixingRisk === "high" ? 0.25 :
                     mixingRisk === "medium" ? 0.15 : 0.10;

  // Scenario 4: Bust/Underperformance
  const bustProb = 1 - baseCaseProb - highEndProb - mixingProb;

  // Scenarios represent FINAL STORM TOTALS for Central Park
  // As of 7:30 PM: 8.8" on ground, sleet transition, snow returns tonight
  // FLOOR is ~9.5" (current 8.8" + minimal additional)

  return [
    {
      name: "NWS Forecast Verifies",
      probability: baseCaseProb,
      mean: nwsMedian, // 11.5" expected
      stdDev: 1.0,     // Tighter range as storm progresses
      description: `Storm total: ${nwsLow}-${nwsHigh}" as expected`,
    },
    {
      name: "High-End (Brief Mixing)",
      probability: highEndProb,
      // If mixing ends quickly and heavy snow bands return
      mean: nwsHigh, // 14"
      stdDev: 1.2,
      description: "Brief sleet, heavy bands overnight → 13-15\"",
    },
    {
      name: "Extended Mixing",
      probability: mixingProb,
      // Sleet period longer than expected - limits totals
      mean: Math.max(nwsLow, observedSnowfall + 1.5), // ~10.3"
      stdDev: 0.8,
      description: "Prolonged sleet limits final total to 9-11\"",
    },
    {
      name: "Significant Underperformance",
      probability: bustProb,
      // Minimal additional snow after current accumulation
      mean: observedSnowfall + 1.0, // ~9.8" (barely more than now)
      stdDev: 0.5,
      description: "Early wind-down, final 9-10\"",
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
 * UPDATED Jan 25 7:30 PM ET: Storm is in ACTIVE PROGRESS
 * - Central Park: 8.8" officially measured (4pm report)
 * - Sleet mixing happening NOW but snow returns tonight
 * - Expected additional: 2-4" more before storm ends
 * - Market pricing: 52% for 10-12", 38% for 12-14"
 */
export function getCurrentConditions(): CurrentConditions {
  return {
    // STORM TOTAL FORECAST (as of 7:30 PM ET)
    // Already have 8.8" + expecting 2-4" more = 10-14" final
    // Market is pricing 10-14" at 90% combined
    nwsLow: 10,   // Floor given current accumulation
    nwsHigh: 14,  // If mixing is brief, heavy snow overnight
    nwsMedian: 11.5, // Middle of expected range

    // Mixing happening NOW but snow returns after 10pm
    // Risk is MEDIUM - not as bad as initially feared
    mixingRisk: "medium",

    // Track uncertainty is low - storm tracking as expected
    trackUncertainty: "low",

    // OBSERVED: 8.8" at Central Park as of 4pm Sunday
    // This is the FLOOR - we can't end below this
    observedSnowfall: 8.8,

    // Model spread has narrowed as storm progresses
    modelSpread: 3.0,
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

/**
 * Calculate percentile from mixture of Gamma distributions using binary search
 */
export function calculatePercentile(
  percentile: number,
  scenarios: ImprovedScenario[]
): number {
  // Binary search for the value where CDF = percentile
  let low = 0;
  let high = 40; // Max reasonable snowfall
  const tolerance = 0.01;

  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    // CDF at mid = 1 - P(X > mid)
    const cdf = 1 - calculateExceedanceProbabilityImproved(mid, scenarios);

    if (cdf < percentile) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.round((low + high) / 2 * 10) / 10;
}

/**
 * Calculate standard deviation of mixture distribution
 */
export function calculateMixtureStdDev(scenarios: ImprovedScenario[]): number {
  const mean = scenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);

  // Variance of mixture = E[X^2] - E[X]^2
  // E[X^2] = sum of (p_i * (var_i + mean_i^2))
  let eX2 = 0;
  for (const s of scenarios) {
    const variance = s.stdDev * s.stdDev;
    eX2 += s.probability * (variance + s.mean * s.mean);
  }

  const mixtureVariance = eX2 - mean * mean;
  return Math.sqrt(mixtureVariance);
}

/**
 * Get full distribution statistics from scenarios
 */
export function getDistributionStats(scenarios: ImprovedScenario[]) {
  const mean = scenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);
  const stdDev = calculateMixtureStdDev(scenarios);

  return {
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    p10: calculatePercentile(0.10, scenarios),
    p25: calculatePercentile(0.25, scenarios),
    median: calculatePercentile(0.50, scenarios),
    p75: calculatePercentile(0.75, scenarios),
    p90: calculatePercentile(0.90, scenarios),
  };
}

// Export for testing
export { gammaCDF, getGammaParams };
