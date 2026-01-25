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
 * Event phase tracking - critical for mid-event updates
 */
export type EventPhase = "pre-event" | "early-event" | "mid-event" | "late-event" | "post-event";

export interface EventTiming {
  snowStarts: Date;
  heaviestSnow: Date;
  mixingWindowStart: Date;
  mixingWindowEnd: Date;
  snowEnds: Date;
}

/**
 * Get current event phase based on real time
 */
export function getEventPhase(timing: EventTiming): EventPhase {
  const now = new Date();

  if (now < timing.snowStarts) {
    return "pre-event";
  } else if (now < timing.heaviestSnow) {
    return "early-event";
  } else if (now < timing.mixingWindowStart) {
    return "mid-event";
  } else if (now < timing.snowEnds) {
    return "late-event";
  } else {
    return "post-event";
  }
}

/**
 * Get the current storm timing for Jan 24-26, 2026 event
 */
export function getStormTiming(): EventTiming {
  return {
    snowStarts: new Date("2026-01-25T06:00:00Z"),
    heaviestSnow: new Date("2026-01-25T12:00:00Z"),
    mixingWindowStart: new Date("2026-01-25T22:00:00Z"),
    mixingWindowEnd: new Date("2026-01-26T04:00:00Z"),
    snowEnds: new Date("2026-01-26T12:00:00Z"),
  };
}

/**
 * Generate scenarios based on current NWS guidance
 * Updated for Jan 24, 2026 forecast
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
      stdDev: (remainingHigh - remainingLow) / 3,
      description: `NWS forecast: ${nwsLow}-${nwsHigh}" verifies`,
    },
    {
      name: "High-End (All Snow)",
      probability: highEndProb,
      // For Central Park: only +2" above NWS high (not +3" like inland)
      mean: remainingHigh + 2 + observedSnowfall,
      stdDev: 2.0, // Tighter spread for coastal
      description: "Optimal track, no mixing, high ratios",
    },
    {
      name: "Extended Mixing",
      probability: mixingProb,
      // Mixing more likely for Central Park (coastal)
      mean: Math.max(remainingLow - 1, 5) + observedSnowfall,
      stdDev: 1.5,
      description: "More mixing than forecast reduces totals",
    },
    {
      name: "Significant Underperformance",
      probability: bustProb,
      mean: Math.max(remainingLow - 3, 3) + observedSnowfall,
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
 * Get current conditions based on latest NWS guidance and event phase
 *
 * CRITICAL: Optimized for NY CITY CENTRAL PARK specifically
 * Resolution source: weather.gov/wrh/climate?wfo=okx (CLINYC station)
 *
 * Key NWS guidance (as of Jan 25, 2026):
 * - "Around 10 inches near the coast" (Central Park IS coastal NYC)
 * - "Around 16 inches well inland" (NOT applicable to Central Park)
 * - Sunday: 7-11 inches snow/sleet
 * - Sunday Night: 1-3 inches (mixing possible for coastal areas)
 * - Monday: <0.5 inch
 *
 * Central Park is a COASTAL location - mixing risk caps upside potential.
 *
 * @param observedSnowfallOverride - Optional: pass observed snowfall if known
 */
export function getCurrentConditions(observedSnowfallOverride?: number): CurrentConditions {
  const timing = getStormTiming();
  const phase = getEventPhase(timing);
  const now = new Date();

  // Calculate hours into event for observed snowfall estimation
  const hoursIntoEvent = Math.max(0, (now.getTime() - timing.snowStarts.getTime()) / (1000 * 60 * 60));

  // Estimate observed snowfall based on event phase if not provided
  // Snow rate assumed: ~1-1.5"/hour during heavy snow, 0.5"/hour otherwise
  let estimatedObserved = 0;
  if (phase === "early-event") {
    // First few hours, moderate rates
    estimatedObserved = Math.min(hoursIntoEvent * 0.8, 3);
  } else if (phase === "mid-event") {
    // Heavy snow period
    estimatedObserved = Math.min(3 + (hoursIntoEvent - 6) * 1.2, 8);
  } else if (phase === "late-event") {
    // Mixing may be reducing accumulation
    estimatedObserved = Math.min(8 + (hoursIntoEvent - 16) * 0.3, 10);
  } else if (phase === "post-event") {
    // Event over, use NWS median as estimate
    estimatedObserved = 10;
  }

  const observedSnowfall = observedSnowfallOverride ?? (phase === "pre-event" ? 0.3 : Math.round(estimatedObserved * 10) / 10);

  // Adjust confidence based on phase
  // Pre-event: more uncertainty, Mid-event: less uncertainty as we see verification
  let mixingRisk: "low" | "medium" | "high" = "medium";
  let trackUncertainty: "low" | "medium" | "high" = "medium";

  if (phase === "late-event" || phase === "post-event") {
    // We should know by now if mixing occurred
    trackUncertainty = "low";
  }

  return {
    // Central Park specific forecast (coastal NYC)
    // NWS explicitly says "around 10 inches near the coast"
    nwsLow: 8,
    nwsHigh: 12, // Central Park is coastal - cap at 12" (NOT 14" inland value)
    nwsMedian: 10, // NWS says "around 10 inches" for coastal

    // Mixing risk is MEDIUM-HIGH for Central Park (coastal)
    // NWS mentions potential mixing late Sunday for coastal areas
    // This is the key factor limiting upside for Central Park
    mixingRisk,

    // Track uncertainty decreases as event verifies
    trackUncertainty,

    // Observed snowfall - estimated based on event phase
    observedSnowfall,

    // Model spread ~3-4 inches for Central Park
    modelSpread: 4,
  };
}

/**
 * Get event status information for display
 */
export function getEventStatus(): {
  phase: EventPhase;
  phaseDescription: string;
  hoursRemaining: number;
  percentComplete: number;
  timing: EventTiming;
} {
  const timing = getStormTiming();
  const phase = getEventPhase(timing);
  const now = new Date();

  const totalDuration = timing.snowEnds.getTime() - timing.snowStarts.getTime();
  const elapsed = Math.max(0, now.getTime() - timing.snowStarts.getTime());
  const percentComplete = Math.min(100, Math.round((elapsed / totalDuration) * 100));
  const hoursRemaining = Math.max(0, (timing.snowEnds.getTime() - now.getTime()) / (1000 * 60 * 60));

  const phaseDescriptions: Record<EventPhase, string> = {
    "pre-event": "Snow expected to begin soon",
    "early-event": "Snow beginning - accumulation starting",
    "mid-event": "Heavy snow in progress",
    "late-event": "Snow tapering - possible mixing",
    "post-event": "Event complete - final totals being recorded",
  };

  return {
    phase,
    phaseDescription: phaseDescriptions[phase],
    hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    percentComplete,
    timing,
  };
}

/**
 * Run the improved model and return full results
 */
export function runImprovedModel(observedSnowfallOverride?: number) {
  const conditions = getCurrentConditions(observedSnowfallOverride);
  const scenarios = generateImprovedScenarios(conditions);
  const eventStatus = getEventStatus();

  const kalshiProbs = calculateKalshiProbabilities(scenarios);
  const polymarketProbs = calculatePolymarketProbabilities(scenarios);

  // Calculate distribution statistics
  const mean = scenarios.reduce((sum, s) => sum + s.probability * s.mean, 0);

  return {
    timestamp: new Date().toISOString(),
    conditions,
    eventStatus: {
      phase: eventStatus.phase,
      phaseDescription: eventStatus.phaseDescription,
      hoursRemaining: eventStatus.hoursRemaining,
      percentComplete: eventStatus.percentComplete,
    },
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
