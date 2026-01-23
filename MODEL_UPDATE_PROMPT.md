# CRITICAL MODEL UPDATE: Real-Time Data Pipeline + Independent Pricing

## OBJECTIVE
Build a **first-principles probabilistic model** that:
1. Fetches real-time data from authoritative sources (NWS API, model data)
2. Parses forecast text to extract parameters automatically
3. Derives probability distributions INDEPENDENTLY (no market anchoring)
4. Updates continuously as new data arrives
5. Compares model output to market prices to identify EDGE

**DO NOT USE MARKET PRICES AS INPUTS. DERIVE EVERYTHING FROM RAW WEATHER DATA.**

---

## PART 1: REAL-TIME DATA ARCHITECTURE

### Data Sources & Update Frequencies

| Source | URL | Update Frequency | What to Extract |
|--------|-----|------------------|-----------------|
| NWS API Point | `https://api.weather.gov/points/40.7812,-73.9665` | On-demand | Grid endpoints |
| NWS Gridpoint Forecast | `https://api.weather.gov/gridpoints/OKX/33,37/forecast` | Hourly | Detailed forecast |
| NWS AFD (Area Forecast Discussion) | `https://api.weather.gov/products/types/AFD/locations/OKX` | ~4-6 hrs | Snowfall ranges, confidence |
| NWS Hourly Forecast | `https://api.weather.gov/gridpoints/OKX/33,37/forecast/hourly` | Hourly | Precip timing, temps |
| NWS Winter Graphics | `https://www.weather.gov/okx/winter` | ~6 hrs | Probabilistic snow maps |
| GFS Model | Tropical Tidbits or NOMADS | Every 6 hrs | Total snow accumulation |
| ECMWF Model | Tropical Tidbits | Every 12 hrs | Total snow accumulation |
| NAM Model | Tropical Tidbits | Every 6 hrs | Total snow accumulation |

### File Structure for Data Pipeline
```
lib/
├── data/
│   ├── fetchers/
│   │   ├── nws-api.ts          # NWS API client
│   │   ├── nws-afd-parser.ts   # Parse AFD text for snowfall ranges
│   │   ├── nws-probabilistic.ts # Parse probabilistic graphics
│   │   ├── model-gfs.ts        # GFS data fetcher
│   │   ├── model-ecmwf.ts      # ECMWF data fetcher
│   │   ├── model-nam.ts        # NAM data fetcher
│   │   └── index.ts            # Unified data fetcher
│   ├── parsers/
│   │   ├── afd-nlp.ts          # Extract numbers from AFD text
│   │   ├── confidence-scorer.ts # Score forecaster confidence
│   │   └── scenario-detector.ts # Detect scenario shifts
│   └── cache/
│       └── data-store.ts       # Cache with timestamps
├── model/
│   ├── scenarios.ts            # Dynamic scenario generation
│   ├── probability.ts          # Gaussian mixture calculations
│   ├── calibration.ts          # Historical accuracy adjustments
│   ├── ensemble.ts             # Ensemble model weighting
│   └── index.ts                # Main model runner
├── realtime/
│   ├── polling.ts              # Polling manager
│   ├── websocket-server.ts     # Push updates to dashboard
│   └── update-triggers.ts      # When to recalculate
└── comparison/
    ├── market-fetcher.ts       # Fetch Polymarket/Kalshi prices (OUTPUT ONLY)
    ├── edge-calculator.ts      # Compare model vs market
    └── alerts.ts               # Alert when edge > threshold
```

---

## PART 2: NWS DATA PARSING (CRITICAL)

### AFD Text Parsing
The Area Forecast Discussion contains the REAL forecast. Parse it automatically.

```typescript
// lib/data/parsers/afd-nlp.ts

interface AFDExtraction {
  timestamp: string;
  snowfallRange: {
    low: number;
    high: number;
    units: string;
  };
  localizedMax: number | null;
  mixingMentioned: boolean;
  mixingTiming: string | null;
  confidenceLanguage: string[];
  keyPhrases: string[];
  slrMentioned: { low: number; high: number } | null;
  qpfMentioned: number | null;
}

export function parseAFD(afdText: string): AFDExtraction {
  const extraction: AFDExtraction = {
    timestamp: new Date().toISOString(),
    snowfallRange: { low: 0, high: 0, units: 'inches' },
    localizedMax: null,
    mixingMentioned: false,
    mixingTiming: null,
    confidenceLanguage: [],
    keyPhrases: [],
    slrMentioned: null,
    qpfMentioned: null,
  };

  // Extract snowfall range patterns
  // "widespread 8 to 14 inches"
  // "8 to 12 inches possible"
  // "expecting 10 to 15 inches"
  const snowRangePattern = /(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\s*inch/gi;
  const snowMatches = [...afdText.matchAll(snowRangePattern)];
  
  if (snowMatches.length > 0) {
    // Take the most recent/prominent mention
    const primaryMatch = snowMatches[0];
    extraction.snowfallRange.low = parseInt(primaryMatch[1]);
    extraction.snowfallRange.high = parseInt(primaryMatch[2]);
  }

  // Extract localized maximum
  // "approaching a foot and a half" = 18
  // "localized amounts up to 18 inches"
  const localMaxPattern = /(?:localized|approaching|up to)\s*(?:a foot and a half|(\d{1,2})(?:\s*inches)?)/gi;
  const localMaxMatch = afdText.match(localMaxPattern);
  if (localMaxMatch) {
    if (localMaxMatch[0].includes('foot and a half')) {
      extraction.localizedMax = 18;
    } else {
      const numMatch = localMaxMatch[0].match(/(\d{1,2})/);
      if (numMatch) extraction.localizedMax = parseInt(numMatch[1]);
    }
  }

  // Detect mixing language
  const mixingPatterns = [
    /mix(?:ing|ed)?\s*(?:with|to)?\s*sleet/gi,
    /sleet\s*mix/gi,
    /change(?:over)?\s*to\s*sleet/gi,
    /wintry\s*mix/gi,
  ];
  extraction.mixingMentioned = mixingPatterns.some(p => p.test(afdText));

  // Extract mixing timing
  const mixingTimePattern = /(?:mixing|sleet|changeover)\s*(?:Sunday|Monday)?\s*(evening|night|afternoon|morning)/gi;
  const mixingTimeMatch = afdText.match(mixingTimePattern);
  if (mixingTimeMatch) {
    extraction.mixingTiming = mixingTimeMatch[0];
  }

  // Extract confidence language
  const confidencePatterns = {
    high: /(?:high confidence|confident|likely|expected)/gi,
    medium: /(?:moderate confidence|possible|may|could)/gi,
    low: /(?:low confidence|uncertain|question|unclear)/gi,
  };
  
  for (const [level, pattern] of Object.entries(confidencePatterns)) {
    if (pattern.test(afdText)) {
      extraction.confidenceLanguage.push(level);
    }
  }

  // Extract SLR (snow-to-liquid ratio)
  const slrPattern = /(\d{1,2}):?1\s*(?:to|-)\s*(\d{1,2}):?1/gi;
  const slrMatch = afdText.match(slrPattern);
  if (slrMatch) {
    const nums = slrMatch[0].match(/\d{1,2}/g);
    if (nums && nums.length >= 2) {
      extraction.slrMentioned = {
        low: parseInt(nums[0]),
        high: parseInt(nums[1]),
      };
    }
  }

  // Extract QPF (liquid equivalent)
  const qpfPattern = /QPF\s*(?:progged|forecast|expected)?\s*(?:over|around|near)?\s*(\d+\.?\d*)\s*inch/gi;
  const qpfMatch = afdText.match(qpfPattern);
  if (qpfMatch) {
    const numMatch = qpfMatch[0].match(/(\d+\.?\d*)/);
    if (numMatch) extraction.qpfMentioned = parseFloat(numMatch[1]);
  }

  // Key phrases that affect probability
  const keyPhrasePatterns = [
    /double digit/gi,
    /significant/gi,
    /major winter storm/gi,
    /heavy at times/gi,
    /1\s*(?:to\s*)?2\s*in(?:ch)?(?:es)?\/hr/gi,  // snowfall rates
    /blizzard/gi,
    /historic/gi,
  ];
  
  for (const pattern of keyPhrasePatterns) {
    if (pattern.test(afdText)) {
      extraction.keyPhrases.push(pattern.source);
    }
  }

  return extraction;
}
```

### Point Forecast Parsing
```typescript
// lib/data/fetchers/nws-api.ts

interface NWSPointForecast {
  periods: {
    name: string;
    detailedForecast: string;
    shortForecast: string;
    temperature: number;
    windSpeed: string;
    snowAmount?: { low: number; high: number };
  }[];
}

export async function fetchNWSForecast(): Promise<NWSPointForecast> {
  // Step 1: Get grid coordinates
  const pointRes = await fetch('https://api.weather.gov/points/40.7812,-73.9665');
  const pointData = await pointRes.json();
  
  // Step 2: Get forecast from grid
  const forecastUrl = pointData.properties.forecast;
  const forecastRes = await fetch(forecastUrl);
  const forecastData = await forecastRes.json();
  
  // Step 3: Parse snow amounts from detailed forecast
  const periods = forecastData.properties.periods.map((period: any) => {
    const snowMatch = period.detailedForecast.match(
      /(?:New snow accumulation of\s*)?(\d+)\s*to\s*(\d+)\s*inch/i
    );
    
    return {
      name: period.name,
      detailedForecast: period.detailedForecast,
      shortForecast: period.shortForecast,
      temperature: period.temperature,
      windSpeed: period.windSpeed,
      snowAmount: snowMatch ? {
        low: parseInt(snowMatch[1]),
        high: parseInt(snowMatch[2]),
      } : undefined,
    };
  });
  
  return { periods };
}
```

---

## PART 3: DYNAMIC SCENARIO GENERATION

**DO NOT HARDCODE SCENARIOS.** Generate them from parsed data.

```typescript
// lib/model/scenarios.ts

interface DynamicScenario {
  name: string;
  probability: number;
  snowfallMean: number;
  snowfallStdDev: number;
  description: string;
  triggerConditions: string[];
}

interface ParsedForecastData {
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
  confidenceLevel: 'high' | 'medium' | 'low';
}

export function generateScenarios(data: ParsedForecastData): DynamicScenario[] {
  const { nwsRange, localizedMax, mixingMentioned, modelData, qpf, slr } = data;
  
  // Calculate NWS midpoint
  const nwsMidpoint = (nwsRange.low + nwsRange.high) / 2;
  
  // Calculate model spread
  const modelValues = [modelData.gfs, modelData.ecmwf, modelData.nam];
  const modelMean = modelValues.reduce((a, b) => a + b, 0) / modelValues.length;
  const modelSpread = Math.max(...modelValues) - Math.min(...modelValues);
  
  // Calculate high-end potential
  const highEndPotential = localizedMax || (nwsRange.high + 4);
  
  // Calculate low-end floor based on mixing
  const lowEndFloor = mixingMentioned 
    ? Math.max(nwsRange.low - 3, 2) 
    : nwsRange.low;

  // SCENARIO 1: High-End (All Snow, Good Banding)
  // Probability based on: model agreement on high end, no mixing mention, high SLR
  let highEndProb = 0.15; // Base
  if (modelData.ecmwf > nwsMidpoint + 2) highEndProb += 0.05;
  if (!mixingMentioned) highEndProb += 0.05;
  if (slr && slr.high >= 15) highEndProb += 0.05;
  
  const highEndScenario: DynamicScenario = {
    name: 'High-End (All Snow)',
    probability: Math.min(highEndProb, 0.30),
    snowfallMean: highEndPotential,
    snowfallStdDev: 2.5,
    description: 'Storm tracks optimally, all snow, good banding',
    triggerConditions: ['Euro solution verifies', 'No mixing', 'High SLR'],
  };

  // SCENARIO 2: Base Case
  // This is the NWS official forecast
  let baseCaseProb = 0.50; // NWS is usually close
  
  const baseCaseScenario: DynamicScenario = {
    name: 'Base Case (NWS Forecast)',
    probability: baseCaseProb,
    snowfallMean: nwsMidpoint,
    snowfallStdDev: (nwsRange.high - nwsRange.low) / 3, // ~99% within range
    description: `NWS official forecast: ${nwsRange.low}-${nwsRange.high}"`,
    triggerConditions: ['Track as forecast', 'Brief mixing if any'],
  };

  // SCENARIO 3: Mixing/Warm Nose
  // Higher probability if mixing explicitly mentioned
  let mixingProb = mixingMentioned ? 0.25 : 0.15;
  const mixingMean = nwsRange.low + (mixingMentioned ? -1 : 1);
  
  const mixingScenario: DynamicScenario = {
    name: 'Extended Mixing',
    probability: mixingProb,
    snowfallMean: Math.max(mixingMean, lowEndFloor),
    snowfallStdDev: 1.5,
    description: 'More sleet/mix than forecast, cuts into snow totals',
    triggerConditions: ['Extended warm nose', '6+ hours of sleet'],
  };

  // SCENARIO 4: Significant Underperformance
  // Track miss, dry slot, early changeover
  let underperformProb = 0.05;
  if (modelSpread > 6) underperformProb += 0.03; // High uncertainty
  
  const underperformScenario: DynamicScenario = {
    name: 'Significant Underperformance',
    probability: underperformProb,
    snowfallMean: Math.max(lowEndFloor - 2, 2),
    snowfallStdDev: 1.0,
    description: 'Track miss, dry slot, or extended warm air',
    triggerConditions: ['Track shifts significantly', 'Major dry slot'],
  };

  // Normalize probabilities to sum to 1
  const scenarios = [highEndScenario, baseCaseScenario, mixingScenario, underperformScenario];
  const totalProb = scenarios.reduce((sum, s) => sum + s.probability, 0);
  scenarios.forEach(s => s.probability = s.probability / totalProb);

  return scenarios;
}
```

---

## PART 4: PROBABILITY CALCULATION ENGINE

```typescript
// lib/model/probability.ts

// Standard normal CDF using Zelen & Severo approximation
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Calculate P(Snow > threshold) using Gaussian mixture
export function calculateExceedanceProbability(
  threshold: number,
  scenarios: { probability: number; snowfallMean: number; snowfallStdDev: number }[]
): number {
  let totalProb = 0;
  
  for (const scenario of scenarios) {
    const z = (threshold - scenario.snowfallMean) / scenario.snowfallStdDev;
    const exceedanceProb = 1 - normalCDF(z);
    totalProb += scenario.probability * exceedanceProb;
  }
  
  return totalProb;
}

// Calculate full distribution
export function calculateFullDistribution(scenarios: DynamicScenario[]) {
  const thresholds = [2, 4, 6, 8, 10, 12, 14, 15, 16, 18, 20, 24];
  const strikeProbabilities: Record<string, number> = {};
  
  for (const threshold of thresholds) {
    strikeProbabilities[threshold.toString()] = calculateExceedanceProbability(threshold, scenarios);
  }
  
  // Calculate distribution statistics
  // Mean = weighted average of scenario means
  const mean = scenarios.reduce((sum, s) => sum + s.probability * s.snowfallMean, 0);
  
  // Variance = weighted average of (variance + mean^2) - overall_mean^2
  const secondMoment = scenarios.reduce(
    (sum, s) => sum + s.probability * (s.snowfallStdDev ** 2 + s.snowfallMean ** 2),
    0
  );
  const variance = secondMoment - mean ** 2;
  const stdDev = Math.sqrt(variance);
  
  // Percentiles via numerical integration
  const percentiles = calculatePercentiles(scenarios, [0.1, 0.25, 0.5, 0.75, 0.9]);
  
  return {
    strikeProbabilities,
    mean,
    stdDev,
    median: percentiles[0.5],
    p10: percentiles[0.1],
    p25: percentiles[0.25],
    p75: percentiles[0.75],
    p90: percentiles[0.9],
  };
}

function calculatePercentiles(
  scenarios: DynamicScenario[],
  percentiles: number[]
): Record<number, number> {
  const result: Record<number, number> = {};
  
  for (const p of percentiles) {
    // Binary search for value where CDF = p
    let low = 0;
    let high = 30;
    
    while (high - low > 0.1) {
      const mid = (low + high) / 2;
      const cdf = 1 - calculateExceedanceProbability(mid, scenarios);
      
      if (cdf < p) {
        low = mid;
      } else {
        high = mid;
      }
    }
    
    result[p] = (low + high) / 2;
  }
  
  return result;
}
```

---

## PART 5: REAL-TIME UPDATE SYSTEM

### Polling Manager
```typescript
// lib/realtime/polling.ts

interface DataSource {
  name: string;
  fetchFn: () => Promise<any>;
  intervalMs: number;
  lastFetch: Date | null;
  lastData: any;
}

class PollingManager {
  private sources: Map<string, DataSource> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private onUpdate: (sourceName: string, data: any) => void;

  constructor(onUpdate: (sourceName: string, data: any) => void) {
    this.onUpdate = onUpdate;
  }

  registerSource(source: DataSource) {
    this.sources.set(source.name, source);
  }

  start() {
    for (const [name, source] of this.sources) {
      // Initial fetch
      this.fetchAndUpdate(name);
      
      // Set up interval
      const interval = setInterval(() => {
        this.fetchAndUpdate(name);
      }, source.intervalMs);
      
      this.intervals.set(name, interval);
    }
  }

  private async fetchAndUpdate(name: string) {
    const source = this.sources.get(name);
    if (!source) return;
    
    try {
      const data = await source.fetchFn();
      source.lastFetch = new Date();
      source.lastData = data;
      this.onUpdate(name, data);
    } catch (error) {
      console.error(`Error fetching ${name}:`, error);
    }
  }

  stop() {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

// Usage in API route
export const pollingManager = new PollingManager((sourceName, data) => {
  console.log(`[${new Date().toISOString()}] Updated ${sourceName}`);
  // Trigger model recalculation
  recalculateModel();
});

// Register all sources
pollingManager.registerSource({
  name: 'NWS_AFD',
  fetchFn: fetchAndParseAFD,
  intervalMs: 15 * 60 * 1000, // 15 minutes
  lastFetch: null,
  lastData: null,
});

pollingManager.registerSource({
  name: 'NWS_POINT',
  fetchFn: fetchNWSForecast,
  intervalMs: 30 * 60 * 1000, // 30 minutes
  lastFetch: null,
  lastData: null,
});
```

### WebSocket Server for Dashboard Updates
```typescript
// app/api/ws/route.ts (or separate server)

// For Next.js, use Server-Sent Events instead
// app/api/forecast/stream/route.ts

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial data
      const initialData = getCurrentForecast();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`)
      );
      
      // Set up interval to send updates
      const interval = setInterval(() => {
        const updatedData = getCurrentForecast();
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(updatedData)}\n\n`)
        );
      }, 60000); // Every minute
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Dashboard SSE Client
```typescript
// components/RealtimeProvider.tsx

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ForecastData } from '@/lib/types';

const ForecastContext = createContext<ForecastData | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/forecast/stream');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setForecast(data);
      setLastUpdate(new Date());
    };
    
    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
      // Reconnect after 5 seconds
      setTimeout(() => {
        // Reconnect logic
      }, 5000);
    };
    
    return () => eventSource.close();
  }, []);

  return (
    <ForecastContext.Provider value={forecast}>
      {children}
    </ForecastContext.Provider>
  );
}

export const useForecast = () => useContext(ForecastContext);
```

---

## PART 6: MARKET COMPARISON (OUTPUT ONLY - NOT INPUT)

**CRITICAL: Market data is for COMPARISON only. Never use it to calibrate the model.**

```typescript
// lib/comparison/edge-calculator.ts

interface MarketPrices {
  source: 'polymarket' | 'kalshi';
  timestamp: string;
  buckets: {
    range: string;
    probability: number;
    yesPrice: number;
    noPrice: number;
  }[];
}

interface EdgeAnalysis {
  threshold: string;
  modelProb: number;
  marketProb: number;
  edge: number;
  edgePercent: number;
  direction: 'BUY_YES' | 'BUY_NO' | 'NO_EDGE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  kellyCriterion: number;
  suggestedSize: number;
}

export function calculateEdge(
  modelOutput: { strikeProbabilities: Record<string, number> },
  marketPrices: MarketPrices,
  bankroll: number = 200
): EdgeAnalysis[] {
  const edges: EdgeAnalysis[] = [];
  
  // Convert market buckets to cumulative probabilities
  const marketCumulative = convertToCumulative(marketPrices.buckets);
  
  for (const [threshold, modelProb] of Object.entries(modelOutput.strikeProbabilities)) {
    const marketProb = marketCumulative[threshold] || 0;
    const edge = modelProb - marketProb;
    const edgePercent = (edge / marketProb) * 100;
    
    // Determine direction
    let direction: EdgeAnalysis['direction'] = 'NO_EDGE';
    if (edge > 0.03) direction = 'BUY_YES'; // Model says more likely than market
    if (edge < -0.03) direction = 'BUY_NO'; // Model says less likely than market
    
    // Kelly Criterion: f* = (bp - q) / b
    // where b = odds, p = prob of winning, q = prob of losing
    const impliedOdds = direction === 'BUY_YES' 
      ? (1 / marketProb) - 1 
      : (1 / (1 - marketProb)) - 1;
    const winProb = direction === 'BUY_YES' ? modelProb : (1 - modelProb);
    const kelly = Math.max(0, (impliedOdds * winProb - (1 - winProb)) / impliedOdds);
    
    // Use fractional Kelly (25%) for safety
    const fractionalKelly = kelly * 0.25;
    const suggestedSize = Math.round(bankroll * fractionalKelly);
    
    // Confidence based on edge size and model uncertainty
    let confidence: EdgeAnalysis['confidence'] = 'LOW';
    if (Math.abs(edge) > 0.10) confidence = 'HIGH';
    else if (Math.abs(edge) > 0.05) confidence = 'MEDIUM';
    
    edges.push({
      threshold,
      modelProb,
      marketProb,
      edge,
      edgePercent,
      direction,
      confidence,
      kellyCriterion: kelly,
      suggestedSize,
    });
  }
  
  return edges.filter(e => e.direction !== 'NO_EDGE');
}

function convertToCumulative(
  buckets: MarketPrices['buckets']
): Record<string, number> {
  // Convert bucket probabilities to cumulative P(>X)
  // This requires knowing the bucket ranges
  const cumulative: Record<string, number> = {};
  
  // Sort buckets by upper bound descending
  const sorted = [...buckets].sort((a, b) => {
    const aUpper = parseUpperBound(a.range);
    const bUpper = parseUpperBound(b.range);
    return bUpper - aUpper;
  });
  
  let cumProb = 0;
  for (const bucket of sorted) {
    cumProb += bucket.probability;
    const lowerBound = parseLowerBound(bucket.range);
    cumulative[lowerBound.toString()] = cumProb;
  }
  
  return cumulative;
}

function parseUpperBound(range: string): number {
  if (range.includes('+')) return 100;
  const match = range.match(/(\d+)-(\d+)/);
  return match ? parseInt(match[2]) : 0;
}

function parseLowerBound(range: string): number {
  if (range.startsWith('<')) {
    const match = range.match(/<(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
  const match = range.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}
```

---

## PART 7: EXECUTION INSTRUCTIONS

### Step 1: Update Data Fetchers
Create all files in `lib/data/fetchers/` to fetch real NWS data.

### Step 2: Implement AFD Parser
The AFD parser is CRITICAL - it extracts the real forecast parameters.

### Step 3: Build Dynamic Scenario Generator
Generate scenarios FROM DATA, not hardcoded values.

### Step 4: Set Up Polling
Fetch new data every 15-30 minutes.

### Step 5: Add SSE Endpoint
Push updates to dashboard in real-time.

### Step 6: Add Edge Calculator
Compare model to market (for OUTPUT display only).

### Step 7: Update Dashboard
- Add "Last Updated" with live timestamp
- Add "Data Sources" status panel
- Add "Model vs Market" comparison section
- Add "Edge Opportunities" alerts

### Step 8: Deploy with Cron
Set up Vercel cron job to trigger data refresh:
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/update-forecast",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

---

## PART 8: CURRENT DATA TO FETCH NOW

Run these fetches immediately and parse:

1. **NWS AFD** - https://forecast.weather.gov/product.php?site=OKX&issuedby=OKX&product=AFD
   - Extract: "widespread 8 to 14 inches"
   - Extract: "localized amounts perhaps approaching a foot and a half"
   - Extract: mixing timing

2. **NWS Point Forecast** - Parse "8 to 12 inches" from Sunday, "1 to 3 inches" from Sunday Night
   - Total NWS range: **9-15 inches**

3. **Model Data** (scrape from Tropical Tidbits or estimate):
   - GFS: ~10"
   - ECMWF: ~14"
   - NAM: ~12"

---

## DELIVERABLES

After implementing this:

1. ✅ Model fetches real NWS data every 15 minutes
2. ✅ Scenarios generated dynamically from parsed forecast
3. ✅ Dashboard updates in real-time via SSE
4. ✅ Edge calculator shows model vs market comparison
5. ✅ No market price anchoring - pure first-principles model
6. ✅ Full audit trail of data sources and timestamps

**START NOW. Implement in this order: Fetchers → Parser → Scenarios → Probability → Polling → Dashboard.**
