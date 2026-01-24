# Critical Analysis of the NYC Snow Forecast Model

## Executive Summary

After investigating the market resolution criteria and comparing our model to current NWS guidance, I've identified **several critical flaws** that are likely causing our positions to underperform.

---

## Market Resolution Criteria

### Kalshi (KXSNOWSTORM-26JANNYC)
- **Location:** Central Park, NYC (CLINYC station)
- **Period:** January 24-26, 2026 (cumulative total)
- **Source:** NWS Daily Climate Report at `weather.gov/wrh/Climate?wfo=okx`
- **Settlement:** "Strictly greater than X.0 inches" → YES wins

### Polymarket
- **Location:** Central Park, NYC
- **Period:** January 24-26, 2026 (cumulative total)
- **Source:** NOAA "New Snow (IN)" figures for each day
- **Settlement:** Total falls into one of 7 buckets: <4", 4-6", 6-8", 8-10", 10-12", 12-14", 14+"
- **Edge Case:** If exactly on boundary, resolves to HIGHER bracket

---

## Critical Model Flaws

### 1. STALE DATA - Model Not Updated Since Jan 23

The `forecast.json` shows:
```json
"modelRunTimestamp": "2026-01-23T16:00:00Z"
```

**Problem:** We're now past the storm start. The model should be continuously updated with:
- Latest NWS guidance changes
- Any observed snowfall already on the ground
- Updated model runs (GFS, ECMWF, NAM)

### 2. HIGH-END SCENARIO IS OVERLY BULLISH

Our model assigns **25% probability to the "High-End" scenario** with mean = 18".

**Current NWS guidance (Jan 24):**
- "Around 10 inches near the coast" (NYC is coastal)
- "Around 16 inches well inland"
- Central Park is NOT "well inland"

**Problem:** NYC hitting 18" would require:
1. Storm tracking further offshore
2. NO mixing/sleet
3. High snow-to-liquid ratios (15:1+)

The NWS has explicitly mentioned potential mixing for coastal areas. A 25% probability of 18" is **far too optimistic**.

### 3. GAUSSIAN DISTRIBUTION IS INAPPROPRIATE

The model uses normal distributions for each scenario:
```typescript
function scenarioProbExceedingThreshold(threshold: number, mean: number, stdDev: number) {
  const z = (threshold - mean) / stdDev;
  return 1 - normalCDF(z);
}
```

**Problems:**
1. Snowfall is typically RIGHT-SKEWED, not symmetric
2. Normal distribution allows negative snowfall (nonsensical)
3. Snowstorms often "bust" completely (bimodal risk)

**Better approaches:**
- Gamma distribution (right-skewed, non-negative)
- Log-normal distribution
- Truncated normal at zero
- Mixture model with "bust" scenario getting explicit low-end mass

### 4. SCENARIO PROBABILITIES ARE ARBITRARY

The scenario weights are essentially guesses:
- High-End: 25%
- Base Case: 50%
- Mixing: 20%
- Bust: 5%

**No rigorous methodology:**
- Not derived from ensemble spread
- Not calibrated against historical forecast accuracy
- Not accounting for "day-of" reduced uncertainty

### 5. MODEL DOESN'T MATCH MARKET STRUCTURES

**Kalshi:** Over/under specific thresholds (2, 4, 6, 8, 10, 12, 15, 18, 20, 24")
- Our P(>X) calculation is correct for this

**Polymarket:** Discrete buckets (<4, 4-6, 6-8, 8-10, 10-12, 12-14, 14+")
- We need P(a ≤ X < b), NOT P(X > threshold)
- Current model doesn't properly calculate bucket probabilities

### 6. DOESN'T ACCOUNT FOR CURRENT OBSERVATIONS

If any snow has already fallen on Jan 24, it should be:
1. Added to the baseline
2. Uncertainty reduced accordingly

---

## Current NWS Forecast (as of Jan 24)

From the Area Forecast Discussion:
- **Coastal NYC (including Central Park):** ~10 inches
- **Inland:** ~16 inches
- **Key risk:** Late Sunday mixing could reduce totals
- **Snow ratios:** 12-15:1 expected

**Central Park specific forecast:**
- Sunday: 7-11 inches
- Sunday Night: 1-3 inches (mixing possible)
- Monday: <0.5 inches
- **Total: 8-14 inches with median ~10-11"**

---

## Comparison: Our Model vs Reality

| Metric | Our Model | NWS Guidance | Market Implied |
|--------|-----------|--------------|----------------|
| Median | 11.8" | ~10-11" | ~10-11" |
| P(>10") | 62% | ~50% | 61% (Kalshi) |
| P(>12") | 48% | ~30-35% | 44% (Kalshi) |
| P(>15") | 28% | ~15-20% | 25% (Kalshi) |

**Analysis:** Our model is ~10-15% too bullish on higher thresholds.

---

## Recommended Fixes

### Immediate (for current storm):
1. Update NWS range to 8-12" (not 8-14")
2. Reduce high-end scenario probability to 15%
3. Increase mixing scenario to 25%
4. Set median to 10", not 11.8"

### Model Architecture Improvements:
1. Switch to Gamma distribution (right-skewed, non-negative)
2. Add explicit "bust" probability mass at low end
3. Calibrate against historical NWS forecast accuracy
4. Add separate calculation for Polymarket bucket probabilities

---

## Revised Probabilities (Recommendation)

Based on current NWS guidance and proper statistical modeling:

| Threshold | Our Model | Recommended | Kalshi Market |
|-----------|-----------|-------------|---------------|
| >6" | 89% | 92% | 85% |
| >8" | 78% | 75% | 74% |
| >10" | 62% | 50% | 61% |
| >12" | 48% | 35% | 44% |
| >15" | 28% | 18% | 25% |
| >18" | 12% | 8% | 14% |
| >20" | 6% | 4% | 10% |

**Key insight:** Our model is too bullish above 10". The markets are also slightly bullish but less so than our model. This explains why our >10" and >12" positions are losing money.
