# NYC Snowfall Forecast Dashboard

## Project Overview
Building a probability model + dashboard to predict Central Park snowfall for Jan 24-26, 2026.
Dashboard should be dark-themed, modern, and deployed to Vercel.

## Quick Commands
- `npm run dev` - Start local server at http://localhost:3000
- `npx vercel` - Deploy to Vercel
- `npm run build` - Build for production

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts

## Current Status
- [ ] Phase 1: Project setup + Vercel deploy
- [ ] Phase 2: Dashboard shell with all components
- [ ] Phase 3: Probability model + data
- [ ] Phase 4: Connect data + polish

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
Project URL: [Will be set after first deploy]
