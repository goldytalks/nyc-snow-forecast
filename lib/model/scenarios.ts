export interface Scenario {
  name: string;
  probability: number;
  snowfallMean: number;
  snowfallStdDev: number;
  description: string;
  color: string;
}

// Scenario definitions based on current meteorological analysis
export const scenarios: Scenario[] = [
  {
    name: "South Track - All Snow",
    probability: 0.20,
    snowfallMean: 15.0,
    snowfallStdDev: 2.5,
    description: "Storm tracks south, cold air locks in, all snow",
    color: "#10b981", // emerald
  },
  {
    name: "Base Case - Brief Mixing",
    probability: 0.50,
    snowfallMean: 10.5,
    snowfallStdDev: 2.0,
    description: "Current NWS forecast, 2-4 hours of mixing",
    color: "#3b82f6", // blue
  },
  {
    name: "North Track - Extended Mixing",
    probability: 0.25,
    snowfallMean: 7.0,
    snowfallStdDev: 1.5,
    description: "Storm tracks north, 6+ hours of sleet/mix",
    color: "#f59e0b", // amber
  },
  {
    name: "Significant Underperformance",
    probability: 0.05,
    snowfallMean: 3.5,
    snowfallStdDev: 1.0,
    description: "Dry slot, early changeover, or track miss",
    color: "#ef4444", // red
  },
];

// Validate scenarios sum to 1.0
const totalProbability = scenarios.reduce((sum, s) => sum + s.probability, 0);
if (Math.abs(totalProbability - 1.0) > 0.001) {
  console.warn(`Scenario probabilities sum to ${totalProbability}, expected 1.0`);
}
