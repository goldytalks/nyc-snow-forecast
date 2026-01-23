import { scenarios, type Scenario } from "./scenarios";

/**
 * Standard normal CDF approximation using Zelen & Severo (1964)
 * Accurate to ~1e-5
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate P(snow > threshold) for a single scenario using normal distribution
 */
function scenarioProbExceedingThreshold(
  threshold: number,
  mean: number,
  stdDev: number
): number {
  // P(X > threshold) = 1 - P(X <= threshold) = 1 - CDF(threshold)
  const z = (threshold - mean) / stdDev;
  return 1 - normalCDF(z);
}

/**
 * Calculate P(snow > threshold) as weighted sum across all scenarios
 */
export function calculateExceedanceProbability(threshold: number): number {
  let probability = 0;

  for (const scenario of scenarios) {
    const scenarioExceedance = scenarioProbExceedingThreshold(
      threshold,
      scenario.snowfallMean,
      scenario.snowfallStdDev
    );
    probability += scenario.probability * scenarioExceedance;
  }

  return Math.min(1, Math.max(0, probability));
}

/**
 * Calculate strike probabilities for all standard thresholds
 */
export function calculateAllStrikeProbabilities(): Record<string, number> {
  const thresholds = [2, 4, 6, 8, 10, 12, 15, 18, 20, 24];
  const result: Record<string, number> = {};

  for (const threshold of thresholds) {
    result[threshold.toString()] = calculateExceedanceProbability(threshold);
  }

  return result;
}

/**
 * Calculate distribution statistics from the mixture model
 */
export function calculateDistributionStats() {
  // Mean is weighted average of scenario means
  const mean = scenarios.reduce(
    (sum, s) => sum + s.probability * s.snowfallMean,
    0
  );

  // Variance is weighted average of (variance + squared deviation from overall mean)
  const variance = scenarios.reduce((sum, s) => {
    const scenarioVariance = s.snowfallStdDev ** 2;
    const deviationSquared = (s.snowfallMean - mean) ** 2;
    return sum + s.probability * (scenarioVariance + deviationSquared);
  }, 0);

  const stdDev = Math.sqrt(variance);

  // Approximate percentiles using simulation
  const p10 = approximatePercentile(0.1);
  const p25 = approximatePercentile(0.25);
  const p50 = approximatePercentile(0.5);
  const p75 = approximatePercentile(0.75);
  const p90 = approximatePercentile(0.9);

  return {
    mean: Math.round(mean * 10) / 10,
    median: Math.round(p50 * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    p10: Math.round(p10 * 10) / 10,
    p25: Math.round(p25 * 10) / 10,
    p75: Math.round(p75 * 10) / 10,
    p90: Math.round(p90 * 10) / 10,
  };
}

/**
 * Approximate a percentile using binary search on the CDF
 */
function approximatePercentile(p: number): number {
  // We want to find x such that P(X <= x) = p
  // P(X <= x) = 1 - P(X > x)
  // So we want P(X > x) = 1 - p

  const targetExceedance = 1 - p;
  let low = 0;
  let high = 30;

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const exceedance = calculateExceedanceProbability(mid);

    if (exceedance > targetExceedance) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}
