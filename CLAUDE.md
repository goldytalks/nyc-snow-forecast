# NYC Snowfall Forecast Dashboard

## Project Overview
Building a probability model + dashboard to predict Central Park snowfall for Jan 24-26, 2026.
Dashboard should be dark-themed, modern, and deployed to Vercel.

## IMPORTANT: Change Workflow

**MANDATORY for every session/change:**

### 1. Document All Progress
- Log ALL changes, updates, and progress to the Changelog section below
- Include: what changed, which files were modified, and why
- Be specific (e.g., "Fixed edge calculation" not just "bug fix")

### 2. Push to GitHub + Deploy to Vercel
After EVERY change, run these commands:
```bash
git add -A && git commit -m "Description of changes" && git push
npx vercel --prod --yes
```

### Full Workflow Checklist:
1. Make changes to code
2. Test locally (`npm run dev`)
3. Log changes to Changelog section below
4. Commit with descriptive message
5. Push to GitHub: `git push`
6. Deploy to Vercel: `npx vercel --prod --yes`
7. Verify at https://nyc-snow-forecast.vercel.app

## Quick Commands
- `npm run dev` - Start local server at http://localhost:3000
- `npx vercel --prod --yes` - Deploy to Vercel production
- `npm run build` - Build for production
- `git push` - Push to GitHub

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts

## Current Status
- [x] Phase 1: Project setup + Vercel deploy
- [x] Phase 2: Dashboard shell with all components
- [x] Phase 3: Probability model + data
- [x] Phase 4: Connect data + polish

## Design Requirements
- Dark background (#0a0a0a)
- Card backgrounds (#111111)
- Accent: Emerald (#10b981)
- Font: Inter/Geist
- Must be responsive

## Key Files
- `PROJECT_SPEC.md` - Full specification (READ THIS FIRST)
- `data/forecast.json` - Model output
- `app/page.tsx` - Main dashboard
- `lib/model/` - Probability calculations

## Model Output Format
Strike probabilities needed for: 2", 4", 6", 8", 10", 12", 15", 18", 20", 24"

## Decisions Made
- Using scenario-based model (4 scenarios)
- Scenarios: South track (20%), Base case (50%), North track (25%), Underperform (5%)
- NWS is source of truth for settlement

## If Stuck
1. Check PROJECT_SPEC.md for detailed instructions
2. Keep it simple - working > perfect
3. Use mock data if can't fetch live data
4. Commit what works, iterate

## Vercel Deployment
Production URL: https://nyc-snow-forecast.vercel.app

## Resolution Sources
- **Kalshi**: NWS Daily Climate Report at weather.gov/wrh/climate?wfo=okx (CLINYC station)
- **Polymarket**: Same source - "New Snow (IN)" figures for Jan 24-26, 2026
- **Location**: NY CITY CENTRAL PARK, NY (coastal location)

## Model Architecture
- Uses Gamma distribution (right-skewed, non-negative)
- 4 scenarios: NWS Verifies (50%), High-End (15%), Extended Mixing (25%), Underperformance (10%)
- **LIVE SNOW OBSERVATIONS**: Auto-fetches from NWS PNS/LSR every 5 minutes
- Uses storm total forecast (8-12") not period-by-period API values
- Mixing risk detection from NWS forecast text

## Live Snow Observation System
The model automatically scans for the latest official Central Park measurements:

**Sources (in priority order):**
1. NWS Public Information Statement (PNS) - official storm reports
2. NWS Local Storm Reports (LSR) - spotter reports
3. Estimated fallback based on known data points

**Files:**
- `lib/data/fetchers/snow-observations.ts` - Live observation fetcher
- `lib/realtime/polling.ts` - Integrates snow data with model

**How it works:**
- Fetches from NWS every 5 minutes
- Parses text for "CENTRAL PARK" mentions with snow amounts
- Prioritizes official NWS observations over spotter reports
- Falls back to time-based estimates if no data available
- Passes live observation to model for probability calculations

---

## Changelog

### 2026-01-25 (Update 7) - CRITICAL MODEL FIX + LIVE OBSERVATIONS
- **Live Snow Observation System**
  - Created `lib/data/fetchers/snow-observations.ts`
  - Auto-fetches from NWS PNS and LSR every 5 minutes
  - Parses Central Park snow amounts from NWS text products
  - Uses official measurements when available, estimates otherwise
  - Integrated into polling system - model always uses latest data
- **Critical Model Fix**
  - REMOVED hardcoded minimums (10-14") that overrode real NWS data
  - Now uses actual NWS storm total (8-12") from Winter Storm Warning
  - Set mixing risk to HIGH (sleet actively falling as of 3:44 PM)
  - Updated scenario probabilities: Base 50%, High-end 15%, Mixing 25%, Bust 10%
  - OLD: Median 12.6", P(>10")=80% - WAY TOO HIGH
  - NEW: Median 9.8", P(>10")=46.5% - REALISTIC
- **Expert Analysis**
  - Launched 5 research agents to gather real-time weather data
  - Created two competing forecast personas (Conservative Carl vs Bullish Betty)
  - Consensus: 8-11" final total, sleet limiting upside
- Files changed: `lib/model/improved-model.ts`, `lib/model/index.ts`, `lib/realtime/polling.ts`, `lib/data/fetchers/snow-observations.ts`, `CLAUDE.md`
- Deployed to Vercel

### 2026-01-25 (Update 6)
- **Distribution Statistics Fix**
  - Added proper percentile calculation using binary search on mixture CDF
  - Added mixture standard deviation calculation (was hardcoded at 3.5)
  - P10/P25/P75/P90 now computed from actual gamma mixture distribution
  - Updated manual market prices to current values
- Files changed: `lib/model/improved-model.ts`, `lib/model/index.ts`, `lib/markets/manual-prices.ts`
- Deployed to Vercel

### 2026-01-25 (Update 5)
- **Model Rebuild - Storm in Progress**
  - FIXED: Model was showing 6.7" due to stale NWS data + aggressive coastal correction
  - REMOVED aggressive 15% coastal correction factor
  - Added MINIMUM BOUNDS (10-14") to prevent stale API data from dragging down forecast
  - Updated NWS guidance to 10-15" for NYC (upgraded from 8-12")
  - Model median now ~12" matching market expectations (~86% for >10")
  - Mixing risk changed from MEDIUM to LOW (storm tracking colder)
  - Scenario probabilities updated: High-end 25%, Mixing 10%, Bust 10%
  - Removed LiveSnowTracker component temporarily for rebuild
- Files changed: `lib/model/improved-model.ts`, `lib/model/index.ts`, `components/Dashboard.tsx`
- Deployed to Vercel

### 2026-01-25 (Update 4)
- **Fixed P&L Calculation for NO Positions**
  - Bug: Portfolio tracker was using YES price for NO positions
  - This caused massively incorrect P&L (e.g., showing -$205 instead of -$6)
  - Fix: Now uses correct price based on position side:
    - YES positions (position > 0): use YES mid price
    - NO positions (position < 0): use NO mid price
  - P&L formula: `(current_price - entry_price) * position_size`
- Files changed: `app/api/markets/route.ts`
- Deployed to Vercel

### 2026-01-25 (Update 3)
- **Live Snow Tracking**: Added real-time snow accumulation tracking for Central Park
  - New `/api/live-snow` endpoint fetches from NWS api.weather.gov
  - Station: KNYC (Central Park) - same as resolution source
  - Shows official storm accumulation from NWS Daily Climate Report
  - Current conditions: temperature, wind, visibility, humidity
  - Live "SNOWING NOW" indicator when snow is detected
  - Auto-refreshes every 60 seconds
  - **Model vs Actual Comparison**: Progress bar showing current accumulation vs model prediction
  - **Resolution Criteria Box**: Clear explanation of settlement source
    - Source: NWS Daily Climate Report (CLINYC)
    - Location: NY City Central Park, NY
    - Measurement: "New Snow (IN)" for Jan 24-26, 2026
  - Direct links to official NWS climate reports
- Files created: `app/api/live-snow/route.ts`, `components/LiveSnowTracker.tsx`
- Files modified: `components/Dashboard.tsx`
- Deployed to Vercel

### 2026-01-25 (Update 2)
- **Edge Display Fix**: Now shows POSITIVE edge on NO shares for BUY_NO signals
  - Previously showed negative edge (e.g., "-27%") for BUY_NO signals
  - Now shows positive edge on the recommended side (e.g., "+27%" for NO)
  - Added "NO model" label to indicate when displaying NO side probability
  - Updated both Kalshi and Polymarket table rows
  - OpportunityCard now shows YES/NO badge with always-positive edge
- Files changed: `components/MarketAnalysis.tsx`, `lib/markets/manual-prices.ts`
- Deployed to Vercel

### 2026-01-25
- **Fixed Chatbot**: Now works WITHOUT any API key
  - Added intelligent rule-based response system as fallback
  - Answers questions about probabilities, scenarios, mixing, Polymarket, Kalshi
  - Uses live forecast data to generate accurate responses
  - Groq API still works if `GROQ_API_KEY` is set (optional upgrade)
  - Added markdown rendering (bold text highlights)
- Files changed: `app/api/chat/route.ts`, `components/ForecastChat.tsx`
- Deployed to Vercel

### 2026-01-24 (Evening - Update 3)
- **Added Chatbot**: AI-powered chat assistant for forecast questions
  - New `/api/chat` endpoint with Groq API + rule-based fallback
  - New `ForecastChat.tsx` component with floating chat UI
  - Suggested questions for common queries
  - Chat has full access to current model data, probabilities, and scenarios
  - Created `components/ui/input.tsx` and `components/ui/button.tsx`
- Files changed: `app/api/chat/route.ts`, `components/ForecastChat.tsx`, `app/page.tsx`
- Deployed to Vercel

### 2026-01-24 (Evening - Update 2)
- **Polymarket Model & Edge Display**: Fixed Polymarket table to show model probabilities and edge
  - Fixed edge matching logic using `rangeDisplay` field
  - Added `polymarketBucketProbabilities` to API response
  - Updated `PolymarketMarketRow` to calculate edge from bucket probabilities
  - Model and Edge columns now display correctly for all ranges (<4", 4-6", etc.)
- Files changed: `components/MarketAnalysis.tsx`, `app/api/markets/route.ts`
- Deployed to Vercel

### 2026-01-24 (Evening)
- **Central Park Optimization**: Updated model to be coastal-specific
  - Applied coastal correction factor (85%) to NWS regional data
  - Reduced high-end scenario probability (20% → 15%)
  - Increased mixing scenario probability (18% → 22%)
  - Added observed snowfall tracking (0.3" recorded)
  - Model now produces: P(>10")=59%, P(>12")=35%
- Files changed: `lib/model/improved-model.ts`, `lib/model/index.ts`, `data/forecast.json`
- Deployed to Vercel

### 2026-01-24 (Afternoon)
- **Improved Model**: Switched from Gaussian to Gamma distribution
  - Created `lib/model/improved-model.ts`
  - Added separate Kalshi and Polymarket probability calculations
  - Added `MODEL_CRITIQUE.md` with critical analysis
- **Kalshi API Fix**: Fixed authentication signature (full path required)
- **Position Tracking**: Added P&L display to dashboard
- **GitHub**: Pushed all code to https://github.com/goldytalks/nyc-snow-forecast

### 2026-01-23
- Initial dashboard setup
- Basic probability model with 4 scenarios
- Deployed to Vercel
