# NYC Snowfall Forecast Dashboard

## Project Overview
Probabilistic model + dashboard to predict Central Park snowfall for Jan 24-26, 2026.
Dashboard is dark-themed, modern, and deployed to Vercel.

**Production URL:** https://nyc-snow-forecast.vercel.app

## Quick Commands
```bash
npm run dev          # Start local server at http://localhost:3000
npx vercel           # Deploy to Vercel
npm run build        # Build for production
```

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts

## Key Files
| File | Purpose |
|------|---------|
| `PROJECT_SPEC.md` | Full specification |
| `MODEL_CRITIQUE.md` | Previous critical analysis |
| `data/forecast.json` | Model output |
| `app/page.tsx` | Main dashboard |
| `lib/model/improved-model.ts` | **Active** probability model (Gamma distributions) |
| `lib/model/probability.ts` | Original model (Normal distributions, deprecated) |
| `lib/model/scenarios.ts` | Scenario generation logic |
| `lib/model/index.ts` | Model orchestration (`USE_IMPROVED_MODEL = true`) |

---

# CRITICAL MODEL ANALYSIS

## Executive Summary

This model attempts to forecast Central Park snowfall using a **weighted mixture of parametric distributions across discrete scenarios**. While the approach is reasonable in concept, there are **fundamental methodological problems** that likely cause systematic errors in probability estimates.

**Bottom line:** The model is probably **5-15% too bullish** on higher thresholds (>10") and **underestimates tail risks** in both directions.

---

## Current Model Architecture

### How It Works
1. Define 4 discrete scenarios with assigned probabilities
2. Each scenario has a mean and standard deviation
3. Model each scenario with a Gamma distribution
4. Calculate P(>X) as weighted sum: `P(>X) = Σ [p_i × (1 - Gamma_CDF(X | μ_i, σ_i))]`

### Current Scenario Configuration
| Scenario | Probability | Mean | StdDev | Description |
|----------|-------------|------|--------|-------------|
| NWS Verifies | 50% | 11.6" | 1.7" | Base case anchored to NWS guidance |
| High-End | 15% | 16.1" | 2.0" | All snow, optimal track |
| Extended Mixing | 22% | 8.0" | 1.5" | More sleet than forecast |
| Underperformance | 13% | 6.0" | 1.5" | Track miss or bust |

### Current Output (as of 2026-01-24)
| Threshold | Model P(>X) |
|-----------|-------------|
| >6" | 91.3% |
| >8" | 76.2% |
| >10" | 58.6% |
| >12" | 34.5% |
| >15" | 12.0% |
| >18" | 2.6% |

---

## CRITICAL FLAWS

### 1. Scenario Probabilities Are Fundamentally Arbitrary

**The Problem:**
The scenario weights (50%, 15%, 22%, 13%) are essentially educated guesses with no rigorous derivation.

**Why It Matters:**
- Small changes in weights cause large swings in output probabilities
- If "High-End" is actually 10% instead of 15%, P(>12") drops from 34.5% to ~28%
- No calibration against historical NWS forecast accuracy
- No ensemble-derived probability information used

**What Should Be Done:**
- Derive scenario probabilities from ensemble spread (if available)
- Calibrate against historical forecast verification data
- Use Bayesian updating as observations accumulate
- At minimum, run sensitivity analysis on weights

---

### 2. The 4-Scenario Framework Is Too Rigid

**The Problem:**
Forcing all outcomes into exactly 4 scenarios artificially constrains the probability space.

**Missing Scenarios:**
- **Overperformance bust**: Storm produces 4-6" of wet, heavy snow (not captured well)
- **Jackpot scenario**: 20"+ from exceptional banding (probability likely underestimated)
- **Complete miss**: Storm tracks out to sea (<2")
- **Multi-phase storm**: Mixed precipitation then changeover back to snow

**Why It Matters:**
- Real weather outcomes don't fit neatly into 4 boxes
- Tails of distribution are poorly modeled
- Binary thinking (bust vs. verify vs. high-end) misses nuance

---

### 3. Gamma Distribution Is Better But Still Wrong

**The Improvement:**
Gamma distribution (right-skewed, non-negative) is better than the original Normal distribution, which allowed negative snowfall.

**Remaining Problems:**

1. **Snowfall is often bimodal, not unimodal:**
   - Either the storm hits or it doesn't
   - Mixing scenarios create discrete modes, not smooth distributions

2. **Parameter conversion is approximate:**
   ```typescript
   scale = stdDev² / mean
   shape = mean² / variance
   ```
   This assumes the Gamma is a reasonable fit, but snowfall may be better modeled by:
   - Mixture of point mass at 0 + continuous distribution
   - Log-normal (multiplicative errors)
   - Truncated normal with explicit mass at boundaries

3. **Simpson's rule CDF approximation:**
   The implementation uses numerical integration with 1000 points. For extreme tails (>20"), this may introduce numerical errors.

---

### 4. The Coastal Correction Factor Is Arbitrary

**What The Model Does:**
```typescript
const coastalCorrectionFactor = 0.85; // 15% reduction
```

**The Problem:**
- Where does 0.85 come from? No citation or derivation.
- Central Park's microclimate is complex:
  - Urban heat island increases mixing risk
  - But also can enhance snow totals in certain setups (convergence zones)
- The correction is applied uniformly when it should vary by scenario

**Better Approach:**
- Use location-specific NWS guidance when available
- Apply different corrections to different scenarios (high-end more affected than bust)
- Use historical Central Park verification stats vs. regional forecasts

---

### 5. Scenarios Are Not Independent (But Treated As If They Are)

**The Assumption:**
The model calculates P(>X) as a simple weighted sum, which implicitly assumes scenarios are mutually exclusive.

**The Reality:**
- "Extended Mixing" and "Underperformance" are correlated (warm air causes both)
- "High-End" and "NWS Verifies" can partially overlap (NWS could verify at high end of range)
- Track and temperature errors are correlated

**Impact:**
This likely causes the model to **underestimate probability mass in the tails** because the scenarios don't properly account for joint probability of multiple factors going wrong (or right) simultaneously.

---

### 6. No Uncertainty Quantification On The Model Itself

**Missing:**
- No confidence intervals on the probability estimates
- No sensitivity analysis
- No acknowledgment that P(>10") = 58.6% could easily be 45-70% given input uncertainty

**Why This Matters For Trading:**
If you're placing bets based on P(>10") = 58.6% vs. market price of 61%, but your model has ±10% uncertainty, you have no actual edge.

---

### 7. Hardcoded Observed Snowfall Doesn't Update

**The Code:**
```typescript
observedSnowfall: 0.3, // Hardcoded in getCurrentConditions()
```

**The Problem:**
- As the storm progresses, observed snowfall should update
- This affects remaining-snowfall calculations
- Model output is stale within hours of storm start

---

### 8. Distribution Statistics Are Inconsistently Calculated

**The Issue:**
```typescript
distribution: {
  median: conditions.nwsMedian,  // Just the input, not computed from mixture!
  mean: Math.round(mean * 10) / 10,  // Properly weighted
  stdDev: 3.5,  // Hardcoded, not computed!
  p10: Math.round((conditions.nwsLow - 2) * 10) / 10,  // Arbitrary offset
  ...
}
```

The `stdDev` is hardcoded at 3.5" rather than computed from the mixture distribution. The percentiles use arbitrary offsets from NWS values rather than inverting the actual CDF.

This means the distribution summary statistics don't match what the strike probabilities imply.

---

### 9. Base Case Scenario Is Too Narrow

**Current Configuration:**
```typescript
name: "NWS Forecast Verifies"
probability: 50%
mean: 11.6"
stdDev: 1.7"  // Implies 95% between ~8-15"
```

**The Problem:**
NWS forecasts have significant error even when they "verify":
- Historical RMSE for NWS at 24-48 hours is ~2.5-3"
- A 1.7" stdDev is too confident
- This makes the base case dominate too much at the center

**Impact:**
P(8-14") is probably **overestimated** because the base case is too tight.

---

### 10. No Temporal Uncertainty Reduction

**The Problem:**
The model doesn't adjust uncertainty based on forecast lead time:
- 48 hours out: High uncertainty (should use wider scenarios)
- 24 hours out: Medium uncertainty
- 12 hours out: Low uncertainty (scenarios should narrow)
- During storm: Should shift to nowcasting mode

The current model uses the same scenario spreads regardless of when it runs.

---

## What The Model Gets Right

Despite the flaws, some things are done reasonably well:

1. **Gamma distribution** is appropriate for snowfall (right-skewed, non-negative)
2. **Coastal adjustment** acknowledges Central Park isn't inland
3. **Multiple scenarios** capture uncertainty better than a single distribution
4. **Mixing risk** is explicitly modeled
5. **Market-specific outputs** (Kalshi thresholds vs. Polymarket buckets)

---

## Recommendations For Improvement

### Quick Fixes
1. **Widen base case stdDev** from 1.7" to 2.5"
2. **Add model uncertainty** display (confidence intervals on probabilities)
3. **Compute percentiles** from actual CDF, not hardcoded offsets
4. **Dynamic observed snowfall** via API or manual input

### Structural Improvements
1. **Increase to 6-8 scenarios** including extreme tails
2. **Correlation structure** between scenarios
3. **Ensemble-based scenario weights** using spread from multiple NWS ensemble runs
4. **Historical calibration** against past NWS forecast verification
5. **Time-varying uncertainty** that narrows as storm approaches

### Advanced
1. **Monte Carlo simulation** instead of parametric distributions
2. **Bayesian updating** as observations come in
3. **Machine learning** calibration on historical forecast-observation pairs

---

## Summary: Why The Model Might Be Wrong

| Issue | Direction of Bias | Confidence |
|-------|-------------------|------------|
| Arbitrary scenario weights | Unknown | High concern |
| Too few scenarios | Under-estimates tails | Medium |
| Independent scenario assumption | Under-estimates extremes | Medium |
| Narrow base case | Over-estimates P(8-14") | Medium |
| Coastal correction arbitrary | Unknown | Medium |
| Gamma may not be right shape | Unknown | Low-Medium |

**Most Likely Error:**
The model is **5-15% too bullish on P(>10"), P(>12"), P(>15")** because:
1. Base case is too confident at the center
2. High-end scenario weight may be too high for coastal Central Park
3. Mixing/bust scenarios may be underweighted

---

## Design Requirements

### Visual Style
- Background: #0a0a0a
- Card backgrounds: #111111
- Accent: Emerald (#10b981)
- Font: Inter/Geist
- Responsive design required

### Model Output Format
Strike probabilities needed for: 2", 4", 6", 8", 10", 12", 15", 18", 20", 24"

### Settlement Source
NWS Daily Climate Report at `weather.gov/wrh/Climate?wfo=okx` (CLINYC station)

---

## If Stuck
1. Check `PROJECT_SPEC.md` for detailed requirements
2. Check `MODEL_CRITIQUE.md` for previous analysis
3. Keep it simple - working > perfect
4. Use mock data if can't fetch live data
5. Commit what works, iterate

---

## Vercel Deployment
Production URL: https://nyc-snow-forecast.vercel.app

## Current Progress
- [x] Phase 1: Project setup + Vercel deploy
- [x] Phase 2: Dashboard shell with all components
- [x] Phase 3: Probability model + data
- [x] Phase 4: Connect data + polish
- [x] Model critique and improvement (Gamma distributions)
- [x] Central Park coastal optimization
- [ ] Real-time updating during storm
- [ ] Historical calibration
- [ ] Uncertainty quantification
