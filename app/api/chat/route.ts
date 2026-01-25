/**
 * Chat API - Answer questions about the snow forecast model
 * Uses Groq API (free tier) with Llama model
 */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getCurrentForecast } from "@/lib/realtime/polling";

export const dynamic = "force-dynamic";

// Lazy initialization to avoid build-time errors
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
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

    // Get Groq client (lazy initialization)
    const groq = getGroqClient();
    if (!groq) {
      return NextResponse.json(
        { error: "Chat service not configured. GROQ_API_KEY is missing." },
        { status: 500 }
      );
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

Strike Probabilities (Kalshi - probability of exceeding threshold):
${Object.entries(forecast.strikeProbabilities)
  .map(([k, v]) => `- P(>${k}"): ${(v * 100).toFixed(1)}%`)
  .join("\n")}

${forecast.polymarketProbabilities ? `
Bucket Probabilities (Polymarket - probability of landing in range):
${Object.entries(forecast.polymarketProbabilities)
  .map(([k, v]) => `- ${k}": ${((v as number) * 100).toFixed(1)}%`)
  .join("\n")}
` : ""}

Scenarios:
${forecast.scenarios
  .map(
    (s) =>
      `- ${s.name} (${(s.probability * 100).toFixed(0)}% chance): ${s.snowfallMean}" mean, range ${s.snowfallRange[0]}-${s.snowfallRange[1]}" - ${s.description}`
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

Be concise but informative. Use the forecast data provided to give specific numbers when answering questions. Keep responses under 200 words.

${forecastContext}`;

    // Build message history for multi-turn conversation
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";

    return NextResponse.json({
      message: assistantMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message. Please try again." },
      { status: 500 }
    );
  }
}
