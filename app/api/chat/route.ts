/**
 * Chat API - Answer questions about the snow forecast model
 * Uses Groq API with Llama (open source) for chat responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentForecast } from "@/lib/realtime/polling";

export const dynamic = "force-dynamic";

// Groq API endpoint for open source models
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Call Groq API with Llama model (open source)
 */
async function callGroqAPI(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile", // Open source Llama 3.1 70B
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("Groq API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error("Groq API call failed:", error);
    return null;
  }
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

    // Get current forecast data for context
    let forecastContext = "";
    let forecast;
    try {
      forecast = await getCurrentForecast();
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

${forecast.eventStatus ? `
Event Status:
- Phase: ${forecast.eventStatus.phase} (${forecast.eventStatus.phaseDescription})
- Hours remaining: ${forecast.eventStatus.hoursRemaining}
- Percent complete: ${forecast.eventStatus.percentComplete}%
- Observed snowfall: ${forecast.eventStatus.observedSnowfall}"
` : ""}

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
        role: h.role,
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    // Try Groq API (open source Llama) first
    const groqResponse = await callGroqAPI(systemPrompt, messages);

    if (groqResponse) {
      return NextResponse.json({
        message: groqResponse,
        timestamp: new Date().toISOString(),
        source: "groq-llama",
      });
    }

    // Fallback to local response generation
    console.log("Groq API not available, using local response generation");
    const localResponse = await generateLocalResponse(message);
    return NextResponse.json({
      message: localResponse,
      timestamp: new Date().toISOString(),
      source: "local",
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
