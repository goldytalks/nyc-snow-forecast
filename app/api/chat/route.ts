/**
 * Chat API - Answer questions about the snow forecast model
 * Uses Claude API with forecast context
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentForecast } from "@/lib/realtime/polling";

export const dynamic = "force-dynamic";

// Create Anthropic client only if API key is available
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  // Dynamic import to avoid issues when API key is not set
  const Anthropic = require("@anthropic-ai/sdk").default;
  return new Anthropic({ apiKey });
}

// Generate a response based on forecast data without calling the API
async function generateLocalResponse(message: string): Promise<string> {
  const forecast = await getCurrentForecast();
  const lowerMessage = message.toLowerCase();

  // Handle common questions with pre-built responses
  if (lowerMessage.includes("likely") || lowerMessage.includes("most likely") || lowerMessage.includes("expected")) {
    return `Based on the current model, the most likely snowfall is around ${forecast.distribution.median}" (median), with a mean of ${forecast.distribution.mean}". The range is ${forecast.distribution.p10}" (10th percentile) to ${forecast.distribution.p90}" (90th percentile).`;
  }

  if (lowerMessage.includes("12") || lowerMessage.includes("foot")) {
    const prob = forecast.strikeProbabilities["12"];
    return `The probability of exceeding 12 inches is ${(prob * 100).toFixed(1)}%. This is based on our scenario-weighted Gamma distribution model.`;
  }

  if (lowerMessage.includes("10")) {
    const prob = forecast.strikeProbabilities["10"];
    return `The probability of exceeding 10 inches is ${(prob * 100).toFixed(1)}%. NWS is forecasting "around 10 inches near the coast" for Central Park.`;
  }

  if (lowerMessage.includes("mixing") || lowerMessage.includes("rain")) {
    return `Mixing (rain/sleet mixing with snow) is a key uncertainty. The Extended Mixing scenario has a 22% probability and would significantly reduce accumulation. The mixing window is expected from ${forecast.timing.mixingWindow[0]} to ${forecast.timing.mixingWindow[1]}.`;
  }

  if (lowerMessage.includes("polymarket") || lowerMessage.includes("bet")) {
    if (forecast.polymarketProbabilities) {
      const probs = Object.entries(forecast.polymarketProbabilities)
        .map(([k, v]) => `${k}": ${((v as number) * 100).toFixed(1)}%`)
        .join(", ");
      return `Based on the model, here are the Polymarket bucket probabilities: ${probs}. Look for buckets where the model probability significantly differs from market prices for potential edge.`;
    }
    return "Polymarket probability data is currently unavailable.";
  }

  if (lowerMessage.includes("scenario")) {
    const scenarioList = forecast.scenarios
      .map(s => `${s.name} (${(s.probability * 100).toFixed(0)}%): ${s.snowfallMean}" mean`)
      .join("; ");
    return `The model uses 4 scenarios: ${scenarioList}. Each scenario uses a Gamma distribution weighted by its probability.`;
  }

  if (lowerMessage.includes("timing") || lowerMessage.includes("when")) {
    return `Snow timing: Starts ${forecast.timing.snowStarts}, heaviest ${forecast.timing.heaviestSnow}, mixing window ${forecast.timing.mixingWindow[0]} to ${forecast.timing.mixingWindow[1]}, ends ${forecast.timing.snowEnds}.`;
  }

  // Default response
  return `The current forecast shows a median of ${forecast.distribution.median}" with ${(forecast.strikeProbabilities["10"] * 100).toFixed(0)}% chance of exceeding 10". Key uncertainties include: ${forecast.keyUncertainties.slice(0, 2).join(", ")}. Ask me about specific thresholds, timing, or market analysis!`;
}

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Check if Anthropic API is available
    const anthropic = getAnthropicClient();

    if (!anthropic) {
      // Fallback to local response generation
      console.log("No Anthropic API key found, using local response generation");
      const response = await generateLocalResponse(message);
      return NextResponse.json({
        message: response,
        timestamp: new Date().toISOString(),
        source: "local",
      });
    }

    // Get current forecast data for context
    let forecastContext = "";
    try {
      const forecast = await getCurrentForecast();
      forecastContext = `
CURRENT FORECAST DATA (as of ${forecast.modelRunTimestamp}):

Distribution:
- Median: ${forecast.distribution.median}"
- Mean: ${forecast.distribution.mean}"
- P10 (low end): ${forecast.distribution.p10}"
- P90 (high end): ${forecast.distribution.p90}"

Strike Probabilities (Kalshi):
${Object.entries(forecast.strikeProbabilities)
  .map(([k, v]) => `- P(>${k}"): ${(v * 100).toFixed(1)}%`)
  .join("\n")}

${forecast.polymarketProbabilities ? `
Bucket Probabilities (Polymarket):
${Object.entries(forecast.polymarketProbabilities)
  .map(([k, v]) => `- ${k}": ${((v as number) * 100).toFixed(1)}%`)
  .join("\n")}
` : ""}

Scenarios:
${forecast.scenarios
  .map(
    (s) =>
      `- ${s.name} (${(s.probability * 100).toFixed(0)}%): ${s.snowfallMean}" mean, range ${s.snowfallRange[0]}-${s.snowfallRange[1]}"`
  )
  .join("\n")}

Key Uncertainties:
${forecast.keyUncertainties.map((u) => `- ${u}`).join("\n")}

Model Inputs:
- NWS Range: ${forecast.modelInputs.nws?.range?.[0] || "?"}-${forecast.modelInputs.nws?.range?.[1] || "?"}"
- ECMWF: ${forecast.modelInputs.ecmwf?.value || "?"}"
- GFS: ${forecast.modelInputs.gfs?.value || "?"}"
- NAM: ${forecast.modelInputs.nam?.value || "?"}"

Timing:
- Snow starts: ${forecast.timing.snowStarts}
- Heaviest snow: ${forecast.timing.heaviestSnow}
- Mixing window: ${forecast.timing.mixingWindow[0]} to ${forecast.timing.mixingWindow[1]}
- Snow ends: ${forecast.timing.snowEnds}

Data Sources:
- NWS Forecast: ${forecast.dataSources.nwsForecast.status} (${forecast.dataSources.nwsForecast.updateTime})
- NWS AFD: ${forecast.dataSources.nwsAFD.status} (${forecast.dataSources.nwsAFD.issueTime})
`;
    } catch (error) {
      console.error("Failed to fetch forecast for context:", error);
      forecastContext = "Unable to fetch current forecast data.";
    }

    const systemPrompt = `You are a helpful assistant for the NYC Snow Forecast Dashboard. You help users understand the snowfall predictions for Central Park, NYC for January 24-26, 2026.

You have access to the current model output and can answer questions about:
- Probability of different snowfall amounts
- How the model works (Gamma distribution, scenario-based)
- Market analysis (Kalshi over/under, Polymarket buckets)
- Weather timing and uncertainties
- Model inputs and data sources

Key facts about this model:
- Resolution location: NY CITY CENTRAL PARK (weather.gov/wrh/climate?wfo=okx)
- Central Park is a COASTAL location, so we apply coastal corrections
- NWS says "around 10 inches near the coast" for NYC
- Model uses Gamma distribution (right-skewed, non-negative)
- 4 scenarios: NWS Verifies (50%), High-End (15%), Extended Mixing (22%), Underperformance (13%)

Be concise but informative. Use the forecast data provided to give specific numbers when answering questions.

${forecastContext}`;

    // Build message history for multi-turn conversation
    const messages = [
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      message: assistantMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
