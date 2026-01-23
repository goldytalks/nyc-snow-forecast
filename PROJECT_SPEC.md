# NYC SNOWFALL PREDICTION MODEL + LIVE DASHBOARD

## OBJECTIVE
Build an independent probabilistic model to predict total snowfall in NYC (Central Park) for January 24-26, 2026, with a **production-ready dashboard deployed to Vercel**.

---

## DASHBOARD DESIGN REQUIREMENTS

### Visual Style (CRITICAL - Follow Exactly)
- **Background:** Near-black (#0a0a0a) with subtle noise texture
- **Cards:** Dark gray (#111111) with subtle border (#1f1f1f) or glass-morphism effect
- **Accent color:** Emerald/teal (#10b981) for positive indicators, use gradients
- **Typography:** Inter or Geist font, clean hierarchy
- **Charts:** Smooth gradients, glow effects on key data points
- **Animations:** Subtle fade-ins, pulse on live data indicators

### Layout (Desktop)
```
┌─────────────────────────────────────────────────────────────────────┐
│  NYC Snowfall Forecast                    Last Updated: [timestamp] │
│  Central Park • January 24-26, 2026       [Status indicators]       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐ │
│  │    HERO FORECAST     │  │     PROBABILITY DISTRIBUTION         │ │
│  │                      │  │                                      │ │
│  │      10.2"           │  │    [Smooth CDF curve with gradient   │ │
│  │     EXPECTED         │  │     fill, interactive hover states]  │ │
│  │                      │  │                                      │ │
│  │   Range: 6" - 15"    │  │    Hover: P(>8") = 62%              │ │
│  │   90% CI: 4" - 18"   │  │                                      │ │
│  └──────────────────────┘  └──────────────────────────────────────┘ │
│                                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  >4"    │ │  >8"    │ │  >12"   │ │  >15"   │ │  >18"   │       │
│  │  91%    │ │  62%    │ │  33%    │ │  15%    │ │  5.5%   │       │
│  │ [gauge] │ │ [gauge] │ │ [gauge] │ │ [gauge] │ │ [gauge] │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                                     │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐ │
│  │      SCENARIOS             │  │      MODEL INPUTS              │ │
│  │                            │  │                                │ │
│  │  [Horizontal stacked bar   │  │  NWS Official    7-11"  ████  │ │
│  │   or treemap showing:      │  │  ECMWF (Euro)    12"    █████ │ │
│  │   - South track: 20%       │  │  GFS             8"     ███   │ │
│  │   - Base case: 50%         │  │  NAM             10"    ████  │ │
│  │   - North track: 25%       │  │                                │ │
│  │   - Underperform: 5%]      │  │  Confidence: MEDIUM           │ │
│  └────────────────────────────┘  └────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  KEY UNCERTAINTIES                                           │   │
│  │  • Storm track: 50km spread between models                   │   │
│  │  • Mixing duration: 2-8 hours of sleet possible             │   │
│  │  • Snow-to-liquid ratio: 8:1 to 15:1 range                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Tech Stack (Use Exactly This)
- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui components (install: npx shadcn-ui@latest init)
- Recharts for data visualization
- Deployed to Vercel

---

## PREDICTION MODEL SPECIFICATION

### Settlement Rules (From Kalshi Contract)
- **Source:** National Weather Service (NWS) official measurement
- **Location:** Central Park, NY (KNYC / GHCND:USW00094728)
- **Time period:** January 24-26, 2026 (inclusive)
- **"Trace" handling:** "T" counts as >0.00" but NOT above any positive threshold
- **Data URL:** https://forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC

### Strike Prices to Calculate
Output P(snow > X) for: 2", 4", 6", 8", 10", 12", 15", 18", 20", 24"

### Data Sources to Fetch

**Primary (NWS - determines settlement):**
1. NWS Point Forecast: https://forecast.weather.gov/MapClick.php?lat=40.7812&lon=-73.9665
2. NWS Probabilistic Graphics: https://www.weather.gov/okx/winter
3. NWS Area Forecast Discussion: https://forecast.weather.gov/product.php?site=OKX&issuedby=OKX&product=AFD

**Secondary (Model Data):**
4. GFS: https://www.tropicaltidbits.com/analysis/models/?model=gfs&region=neus&pkg=asnow
5. Euro: https://www.tropicaltidbits.com/analysis/models/?model=ecmwf&region=neus&pkg=asnow
6. NAM: https://www.tropicaltidbits.com/analysis/models/?model=nam&region=neus&pkg=asnow

### Model Architecture

**Scenario-Based Approach:**
```typescript
interface Scenario {
  name: string;
  probability: number;  // Must sum to 1.0
  snowfallMean: number;
  snowfallStdDev: number;
  description: string;
}

const scenarios: Scenario[] = [
  {
    name: "South Track - All Snow",
    probability: 0.20,
    snowfallMean: 15.0,
    snowfallStdDev: 2.5,
    description: "Storm tracks south, cold air locks in, all snow"
  },
  {
    name: "Base Case - Brief Mixing",
    probability: 0.50,
    snowfallMean: 10.5,
    snowfallStdDev: 2.0,
    description: "Current NWS forecast, 2-4 hours of mixing"
  },
  {
    name: "North Track - Extended Mixing",
    probability: 0.25,
    snowfallMean: 7.0,
    snowfallStdDev: 1.5,
    description: "Storm tracks north, 6+ hours of sleet/mix"
  },
  {
    name: "Significant Underperformance",
    probability: 0.05,
    snowfallMean: 3.5,
    snowfallStdDev: 1.0,
    description: "Dry slot, early changeover, or track miss"
  }
];
```

**Probability Calculation:**
For each threshold X, calculate P(snow > X) as weighted sum across scenarios using normal CDF.

### Key Adjustments to Apply
1. **Mixing penalty:** Each hour of sleet = -0.4" from total
2. **Central Park bias:** -5% vs NWS forecast (urban heat island)
3. **Forecast error:** NWS has ~2.5" RMSE at 24-48hr lead time

---

## PROJECT STRUCTURE

```
nyc-snow-forecast/
├── app/
│   ├── page.tsx                 # Main dashboard
│   ├── layout.tsx               # Root layout (dark theme)
│   ├── globals.css              # Global styles
│   └── api/
│       └── forecast/
│           └── route.ts         # Returns forecast.json data
├── components/
│   ├── ui/                      # shadcn components
│   ├── HeroForecast.tsx         # Main forecast display
│   ├── ProbabilityChart.tsx     # CDF visualization
│   ├── StrikeCards.tsx          # Threshold probability cards
│   ├── ScenarioBreakdown.tsx    # Scenario visualization
│   ├── ModelComparison.tsx      # Model input comparison
│   ├── UncertaintyPanel.tsx     # Key uncertainties
│   └── StatusIndicator.tsx      # Data freshness indicator
├── lib/
│   ├── model/
│   │   ├── scenarios.ts         # Scenario definitions
│   │   ├── probability.ts       # Probability calculations
│   │   ├── fetch-data.ts        # Data fetching utilities
│   │   └── index.ts             # Main model runner
│   ├── types.ts                 # TypeScript types
│   └── utils.ts                 # Utility functions
├── data/
│   └── forecast.json            # Current model output
├── public/
│   └── ...
├── CLAUDE.md                    # Context for Claude
├── PROJECT_SPEC.md              # This file
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## OUTPUT FORMAT

The model should output to `data/forecast.json`:

```json
{
  "modelRunTimestamp": "2026-01-23T14:00:00Z",
  "dataSourcesUsed": ["NWS_point_forecast", "NWS_AFD", "GFS", "ECMWF", "NAM"],
  "distribution": {
    "median": 10.2,
    "mean": 10.5,
    "stdDev": 3.4,
    "p10": 6.0,
    "p25": 8.0,
    "p75": 13.0,
    "p90": 15.5
  },
  "strikeProbabilities": {
    "2": 0.965,
    "4": 0.91,
    "6": 0.78,
    "8": 0.62,
    "10": 0.48,
    "12": 0.33,
    "15": 0.15,
    "18": 0.055,
    "20": 0.025,
    "24": 0.005
  },
  "scenarios": [
    {
      "name": "South Track - All Snow",
      "probability": 0.20,
      "snowfallMean": 15.0,
      "snowfallRange": [12, 18],
      "color": "#10b981"
    },
    {
      "name": "Base Case - Brief Mixing",
      "probability": 0.50,
      "snowfallMean": 10.5,
      "snowfallRange": [8, 13],
      "color": "#3b82f6"
    },
    {
      "name": "North Track - Extended Mixing",
      "probability": 0.25,
      "snowfallMean": 7.0,
      "snowfallRange": [5, 9],
      "color": "#f59e0b"
    },
    {
      "name": "Significant Underperformance",
      "probability": 0.05,
      "snowfallMean": 3.5,
      "snowfallRange": [2, 5],
      "color": "#ef4444"
    }
  ],
  "modelInputs": {
    "nws": { "range": [7, 11], "confidence": "medium" },
    "ecmwf": { "value": 12, "trend": "steady" },
    "gfs": { "value": 8, "trend": "down" },
    "nam": { "value": 10, "trend": "up" }
  },
  "keyUncertainties": [
    "Storm track: 50km spread between model solutions",
    "Mixing duration: NWS forecasts 4hrs but could be 2-8hrs",
    "Snow-to-liquid ratio: 10:1 assumed but could be 8:1 to 15:1"
  ],
  "timing": {
    "snowStarts": "2026-01-25T06:00:00Z",
    "heaviestSnow": "2026-01-25T12:00:00Z",
    "mixingWindow": ["2026-01-25T22:00:00Z", "2026-01-26T04:00:00Z"],
    "snowEnds": "2026-01-26T12:00:00Z"
  }
}
```

---

## EXECUTION INSTRUCTIONS

### Phase 1: Setup (Do First)
1. Initialize Next.js: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"`
2. Install dependencies: `npm install recharts lucide-react`
3. Initialize shadcn: `npx shadcn-ui@latest init` (dark mode, neutral color)
4. Add shadcn components: `npx shadcn-ui@latest add card badge progress`
5. Create folder structure
6. Deploy empty shell to Vercel: `npx vercel`

### Phase 2: Build Dashboard Shell
1. Set up dark theme in globals.css and layout.tsx
2. Create all component files with placeholder content
3. Build responsive grid layout in page.tsx
4. Verify it looks good locally

### Phase 3: Build Model
1. Create probability calculation functions
2. Create scenario definitions
3. Generate forecast.json with realistic initial data
4. Create API route to serve data

### Phase 4: Connect & Polish
1. Connect components to real data
2. Add Recharts visualizations
3. Add animations and hover states
4. Final responsive tweaks
5. Deploy to Vercel

### Commit After Each Phase!

---

## CRITICAL REMINDERS

1. **Dark theme is mandatory** - Do not use light backgrounds anywhere
2. **Commit frequently** - `git add . && git commit -m "Phase X complete"`
3. **Test locally** - Run `npm run dev` and check http://localhost:3000
4. **Deploy early** - Get something on Vercel ASAP so you can check remotely
5. **Use realistic data** - Even if you can't fetch live data, use realistic mock values
6. **Document assumptions** - Add comments explaining probability calculations
