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
- 4 scenarios: NWS Verifies (50%), High-End (15%), Extended Mixing (22%), Underperformance (13%)
- Applies coastal correction factor for Central Park (not inland)
- Accounts for observed snowfall

---

## Changelog

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
