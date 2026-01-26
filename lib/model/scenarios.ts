/**
 * Dynamic Scenario Generator
 * Generates scenarios FROM parsed NWS data, not hardcoded values
 */

export interface Scenario {
  name: string;
  probability: number;
  snowfallMean: number;
  snowfallStdDev: number;
  description: string;
  color: string;
  triggerConditions: string[];
}

export interface ParsedForecastData {
  nwsRange: { low: number; high: number };
  localizedMax: number | null;
  mixingMentioned: boolean;
  mixingTiming: string | null;
  slr: { low: number; high: number } | null;
  qpf: number | null;
  modelData: {
    gfs: number;
    ecmwf: number;
    nam: number;
  };
  confidenceLevel: "high" | "medium" | "low";
}

/**
 * Generate scenarios dynamically based on parsed NWS data
 */
export function generateScenarios(data: ParsedForecastData): Scenario[] {
  const { nwsRange, localizedMax, mixingMentioned, modelData, slr } = data;

  // Calculate NWS midpoint
  const nwsMidpoint = (nwsRange.low + nwsRange.high) / 2;

  // Calculate model spread for uncertainty assessment
  const modelValues = [modelData.gfs, modelData.ecmwf, modelData.nam];
  const modelMean = modelValues.reduce((a, b) => a + b, 0) / modelValues.length;
  const modelSpread = Math.max(...modelValues) - Math.min(...modelValues);

  // Calculate high-end potential (localized max or NWS high + buffer)
  const highEndPotential = localizedMax || nwsRange.high + 2;

  // Calculate low-end floor based on mixing potential
  const lowEndFloor = mixingMentioned
    ? Math.max(nwsRange.low - 3, 2)
    : nwsRange.low - 1;

  // SCENARIO 1: High-End (All Snow, Good Banding)
  // Base probability 20%, adjust based on conditions
  let highEndProb = 0.20;

  // Increase if Euro (ECMWF) is bullish
  if (modelData.ecmwf > nwsMidpoint + 2) highEndProb += 0.05;

  // Increase if no mixing expected
  if (!mixingMentioned) highEndProb += 0.05;

  // Increase if high SLR (fluffy snow)
  if (slr && slr.high >= 15) highEndProb += 0.03;

  // Decrease if models disagree significantly
  if (modelSpread > 6) highEndProb -= 0.05;

  const highEndScenario: Scenario = {
    name: "High-End (All Snow)",
    probability: Math.min(Math.max(highEndProb, 0.10), 0.35),
    snowfallMean: highEndPotential,
    snowfallStdDev: 2.5,
    description: `Storm tracks optimally, all snow, max ${highEndPotential}"`,
    color: "#10b981", // emerald
    triggerConditions: ["Euro solution verifies", "No mixing", "High SLR"],
  };

  // SCENARIO 2: Base Case (NWS Official Forecast)
  // This is the NWS official forecast - typically gets ~50% weight
  let baseCaseProb = 0.50;

  // Adjust based on model agreement with NWS
  const modelsNearNWS = modelValues.filter(
    (v) => Math.abs(v - nwsMidpoint) < 3
  ).length;
  if (modelsNearNWS >= 2) baseCaseProb += 0.05;

  const baseCaseScenario: Scenario = {
    name: "Base Case (NWS Forecast)",
    probability: baseCaseProb,
    snowfallMean: nwsMidpoint,
    snowfallStdDev: (nwsRange.high - nwsRange.low) / 3.5, // ~95% within range
    description: `NWS official: ${nwsRange.low}-${nwsRange.high}"`,
    color: "#3b82f6", // blue
    triggerConditions: ["Track as forecast", "Brief mixing if any"],
  };

  // SCENARIO 3: Extended Mixing / Warm Nose
  // Higher probability if mixing explicitly mentioned in AFD
  let mixingProb = mixingMentioned ? 0.20 : 0.12;

  // Increase if NAM shows more mixing (NAM typically warmer)
  if (modelData.nam < nwsMidpoint - 2) mixingProb += 0.05;

  const mixingMean = mixingMentioned
    ? nwsRange.low - 1
    : nwsRange.low;

  const mixingScenario: Scenario = {
    name: "Extended Mixing",
    probability: Math.min(mixingProb, 0.30),
    snowfallMean: Math.max(mixingMean, lowEndFloor),
    snowfallStdDev: 1.5,
    description: "More sleet/mix than forecast, cuts snow totals",
    color: "#f59e0b", // amber
    triggerConditions: ["Extended warm nose", "6+ hours of sleet"],
  };

  // SCENARIO 4: Significant Underperformance
  // Track miss, dry slot, early changeover - low probability tail
  let underperformProb = 0.05;

  // Increase if high model uncertainty
  if (modelSpread > 6) underperformProb += 0.03;

  // Increase if GFS is pessimistic
  if (modelData.gfs < nwsRange.low) underperformProb += 0.02;

  const underperformScenario: Scenario = {
    name: "Significant Underperformance",
    probability: Math.min(underperformProb, 0.12),
    snowfallMean: Math.max(lowEndFloor - 2, 2),
    snowfallStdDev: 1.0,
    description: "Track miss, dry slot, or extended warm air",
    color: "#ef4444", // red
    triggerConditions: ["Track shifts significantly", "Major dry slot"],
  };

  // Collect all scenarios
  const scenarios = [
    highEndScenario,
    baseCaseScenario,
    mixingScenario,
    underperformScenario,
  ];

  // Normalize probabilities to sum to 1.0
  const totalProb = scenarios.reduce((sum, s) => sum + s.probability, 0);
  scenarios.forEach((s) => {
    s.probability = Math.round((s.probability / totalProb) * 1000) / 1000;
  });

  // Ensure probabilities sum to exactly 1.0 (fix rounding)
  const sumAfterRounding = scenarios.reduce((sum, s) => sum + s.probability, 0);
  if (Math.abs(sumAfterRounding - 1.0) > 0.001) {
    scenarios[1].probability += 1.0 - sumAfterRounding; // Adjust base case
  }

  return scenarios;
}

/**
 * Default scenarios based on CURRENT CONDITIONS (Jan 25, 2026 evening)
 *
 * LIVE DATA: Central Park at 8.8" as of 4pm Sunday
 * Storm continues through tonight, mixing (sleet) expected Sunday night
 *
 * Key factors:
 * - Already have 8.8" - this is the FLOOR
 * - 2-4 hours more snow before mixing
 * - Mixing will cut accumulation rate significantly
 */
export function getDefaultScenarios(): Scenario[] {
  // HARDCODED scenarios based on current storm state
  // Current: 8.8" | Expected additional: 2-5" | Mixing imminent

  const currentAccum = 8.8;

  return [
    {
      name: "NWS Forecast Verifies",
      probability: 0.50,
      snowfallMean: 11.5,        // 8.8 + 2.7" more before mixing
      snowfallStdDev: 1.2,
      description: "Mixing arrives on time, final 10-13\"",
      color: "#3b82f6",
      triggerConditions: ["Mixing by 9pm", "Normal progression"],
    },
    {
      name: "High-End (Brief Mixing)",
      probability: 0.15,
      snowfallMean: 14,          // 8.8 + 5.2" if mixing delayed
      snowfallStdDev: 1.5,
      description: "Mixing delayed 2+ hours, could hit 14-16\"",
      color: "#10b981",
      triggerConditions: ["Mixing delayed", "Continued heavy snow rates"],
    },
    {
      name: "Extended Mixing",
      probability: 0.25,
      snowfallMean: 10.5,        // 8.8 + 1.7" before early mixing
      snowfallStdDev: 1.0,
      description: "Early transition to sleet, final 9-12\"",
      color: "#f59e0b",
      triggerConditions: ["Early mixing", "1-2\" sleet"],
    },
    {
      name: "Significant Underperformance",
      probability: 0.10,
      snowfallMean: 9.5,         // 8.8 + 0.7" (mixing starts NOW)
      snowfallStdDev: 0.5,
      description: "Immediate mixing, barely adds to current total",
      color: "#ef4444",
      triggerConditions: ["Immediate sleet", "Warm nose arrives early"],
    },
  ];
}

// Export default scenarios for backward compatibility
export const scenarios = getDefaultScenarios();

// Validate scenarios sum to 1.0
const totalProbability = scenarios.reduce((sum, s) => sum + s.probability, 0);
if (Math.abs(totalProbability - 1.0) > 0.001) {
  console.warn(`Scenario probabilities sum to ${totalProbability}, expected 1.0`);
}
