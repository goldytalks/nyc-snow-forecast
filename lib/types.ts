export interface Scenario {
  name: string;
  probability: number;
  snowfallMean: number;
  snowfallRange: number[];
  color: string;
  description: string;
}

export interface Distribution {
  median: number;
  mean: number;
  stdDev: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface ModelInput {
  range?: number[];
  value?: number;
  confidence?: string;
  trend?: string;
}

export interface Timing {
  snowStarts: string;
  heaviestSnow: string;
  mixingWindow: string[];
  snowEnds: string;
}

export interface DataSourceStatus {
  status: string;
  updateTime?: string | null;
  issueTime?: string | null;
}

export interface ForecastData {
  modelRunTimestamp: string;
  dataSourcesUsed: string[];
  distribution: Distribution;
  strikeProbabilities: Record<string, number>;
  kalshiProbabilities?: Record<string, number>;
  polymarketProbabilities?: Record<string, number>;
  scenarios: Scenario[];
  modelInputs: Record<string, ModelInput>;
  keyUncertainties: string[];
  timing: Timing;
  dataSources?: {
    nwsForecast?: DataSourceStatus;
    nwsAFD?: DataSourceStatus;
  };
}
