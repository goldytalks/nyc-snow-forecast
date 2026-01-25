/**
 * Chat API - Answer questions about the snow forecast model
 * Uses Groq API if available, otherwise falls back to rule-based responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentForecast } from "@/lib/realtime/polling";
import type { ForecastOutput } from "@/lib/model";

export const dynamic = "force-dynamic";

// Rule-based response system (works without API key)
function generateRuleBasedResponse(message: string, forecast: ForecastOutput): string {
  const msg = message.toLowerCase();

  const median = forecast.distribution.median;
  const mean = forecast.distribution.mean;
  const p10 = forecast.distribution.p10;
  const p90 = forecast.distribution.p90;
  const probs = forecast.strikeProbabilities;
  const polyProbs = forecast.polymarketProbabilities || {};
  const scenarios = forecast.scenarios;

  // Most likely / expected snowfall
  if (msg.includes("most likely") || msg.includes("expected") || msg.includes("how much snow") || msg.includes("prediction")) {
    return `Based on our model, the most likely snowfall for Central Park is around **${median}"** (median). The mean is ${mean}". There's a 80% chance of landing between ${p10}" and ${p90}".

The most likely scenario is "${scenarios[0]?.name}" (${(scenarios[0]?.probability * 100).toFixed(0)}% chance) with a mean of ${scenarios[0]?.snowfallMean}".`;
  }

  // Over 12 inches
  if (msg.includes("over 12") || msg.includes(">12") || msg.includes("above 12") || msg.includes("12 inch")) {
    const prob = probs["12"] || 0;
    return `The model estimates a **${(prob * 100).toFixed(0)}% chance** of getting over 12" of snow in Central Park.

This would require either the "High-End" scenario (${(scenarios[1]?.probability * 100).toFixed(0)}% chance) where all precip falls as snow with high ratios, or an overperformance of the base case.`;
  }

  // Over 10 inches
  if (msg.includes("over 10") || msg.includes(">10") || msg.includes("above 10") || msg.includes("10 inch")) {
    const prob = probs["10"] || 0;
    return `The model estimates a **${(prob * 100).toFixed(0)}% chance** of exceeding 10" of snow in Central Park.

With a median forecast of ${median}", this is close to a coin flip. The NWS says "around 10 inches near the coast" for NYC.`;
  }

  // Over 8 inches
  if (msg.includes("over 8") || msg.includes(">8") || msg.includes("above 8") || msg.includes("8 inch")) {
    const prob = probs["8"] || 0;
    return `The model estimates a **${(prob * 100).toFixed(0)}% chance** of exceeding 8" of snow. This is fairly likely given the ${p10}"-${p90}" range.`;
  }

  // Over 15+ inches
  if (msg.includes("over 15") || msg.includes(">15") || msg.includes("above 15") || msg.includes("15 inch") || msg.includes("big storm") || msg.includes("major")) {
    const prob = probs["15"] || 0;
    return `The model estimates only a **${(prob * 100).toFixed(0)}% chance** of exceeding 15" of snow. This would require the "High-End" scenario where the storm tracks perfectly and all precip falls as snow with high snow-to-liquid ratios.`;
  }

  // Mixing concern
  if (msg.includes("mixing") || msg.includes("sleet") || msg.includes("rain")) {
    const mixingScenario = scenarios.find(s => s.name.toLowerCase().includes("mixing"));
    return `**Mixing is a key uncertainty** for this storm. Central Park is a coastal location, making it more vulnerable to warmer air mixing in.

The "Extended Mixing" scenario (${(mixingScenario?.probability || 0.22) * 100}% chance) would reduce totals to around ${mixingScenario?.snowfallMean || 8}". The NWS mentions potential mixing late Sunday for coastal areas.`;
  }

  // Best bet / Polymarket
  if (msg.includes("best bet") || msg.includes("polymarket") || msg.includes("which bucket") || msg.includes("where to bet")) {
    const buckets = Object.entries(polyProbs).sort((a, b) => (b[1] as number) - (a[1] as number));
    const best = buckets[0];
    return `Based on the model, the **${best[0]}" bucket** has the highest probability at ${((best[1] as number) * 100).toFixed(0)}%.

Top 3 most likely buckets:
1. ${buckets[0][0]}": ${((buckets[0][1] as number) * 100).toFixed(0)}%
2. ${buckets[1][0]}": ${((buckets[1][1] as number) * 100).toFixed(0)}%
3. ${buckets[2][0]}": ${((buckets[2][1] as number) * 100).toFixed(0)}%

Look for edges where market price differs significantly from model probability.`;
  }

  // Kalshi
  if (msg.includes("kalshi") || msg.includes("over under") || msg.includes("strike")) {
    return `**Kalshi Strike Probabilities:**
- P(>6"): ${((probs["6"] || 0) * 100).toFixed(0)}%
- P(>8"): ${((probs["8"] || 0) * 100).toFixed(0)}%
- P(>10"): ${((probs["10"] || 0) * 100).toFixed(0)}%
- P(>12"): ${((probs["12"] || 0) * 100).toFixed(0)}%
- P(>15"): ${((probs["15"] || 0) * 100).toFixed(0)}%

Compare these to market prices to find edges!`;
  }

  // Scenarios
  if (msg.includes("scenario") || msg.includes("outcomes") || msg.includes("possibilities")) {
    return `**Four Scenarios:**

${scenarios.map(s => `• **${s.name}** (${(s.probability * 100).toFixed(0)}%): ${s.snowfallMean}" mean - ${s.description}`).join('\n\n')}`;
  }

  // When / timing
  if (msg.includes("when") || msg.includes("timing") || msg.includes("start") || msg.includes("end")) {
    return `**Storm Timing:**
- Snow starts: Sunday morning (~6 AM)
- Heaviest snow: Sunday midday (~12 PM)
- Potential mixing: Sunday night to early Monday
- Snow ends: Monday morning

The heaviest accumulation will be during the day Sunday before any mixing occurs.`;
  }

  // How model works
  if (msg.includes("how") && (msg.includes("model") || msg.includes("work") || msg.includes("calculate"))) {
    return `**How the Model Works:**

1. Uses a **Gamma distribution** (right-skewed, non-negative) - appropriate for snowfall
2. Combines 4 weighted scenarios based on NWS guidance
3. Applies **coastal correction** for Central Park (reduces inland totals by ~15%)
4. Accounts for observed snowfall already recorded
5. Resolution source: NWS Daily Climate Report for Central Park (CLINYC)

The model is calibrated to NWS guidance of "around 10 inches near the coast" for NYC.`;
  }

  // Default response
  return `**Current Forecast Summary:**

• Median: ${median}" | Mean: ${mean}"
• Range (P10-P90): ${p10}" to ${p90}"
• P(>10"): ${((probs["10"] || 0) * 100).toFixed(0)}% | P(>12"): ${((probs["12"] || 0) * 100).toFixed(0)}%

Try asking about:
- "What are the chances of over 12 inches?"
- "Why is mixing a concern?"
- "What's the best bet on Polymarket?"
- "How does the model work?"`;
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get current forecast data
    let forecast: ForecastOutput;
    try {
      forecast = await getCurrentForecast();
    } catch (error) {
      console.error("Failed to fetch forecast:", error);
      return NextResponse.json({
        message: "Sorry, I couldn't fetch the current forecast data. Please try again.",
        timestamp: new Date().toISOString(),
      });
    }

    // Try Groq API if available
    if (process.env.GROQ_API_KEY) {
      try {
        const Groq = (await import("groq-sdk")).default;
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const forecastContext = `
CURRENT FORECAST DATA:
- Median: ${forecast.distribution.median}"
- Mean: ${forecast.distribution.mean}"
- P10-P90: ${forecast.distribution.p10}" to ${forecast.distribution.p90}"

Strike Probabilities: ${Object.entries(forecast.strikeProbabilities).map(([k, v]) => `P(>${k}")=${(v * 100).toFixed(0)}%`).join(", ")}

Scenarios: ${forecast.scenarios.map(s => `${s.name} (${(s.probability * 100).toFixed(0)}%): ${s.snowfallMean}" mean`).join("; ")}

Key facts: Central Park is coastal, NWS says "around 10 inches near the coast", model uses Gamma distribution with 4 scenarios.`;

        const response = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant for the NYC Snow Forecast Dashboard. Answer questions about the Central Park snowfall forecast for Jan 24-26, 2026. Be concise (under 150 words). Use the data provided.\n\n${forecastContext}`
            },
            { role: "user", content: message },
          ],
          max_tokens: 500,
          temperature: 0.7,
        });

        return NextResponse.json({
          message: response.choices[0]?.message?.content || generateRuleBasedResponse(message, forecast),
          timestamp: new Date().toISOString(),
          source: "groq",
        });
      } catch (error) {
        console.error("Groq API error, falling back to rules:", error);
        // Fall through to rule-based response
      }
    }

    // Fallback: Rule-based response (no API key needed)
    const response = generateRuleBasedResponse(message, forecast);

    return NextResponse.json({
      message: response,
      timestamp: new Date().toISOString(),
      source: "rules",
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
