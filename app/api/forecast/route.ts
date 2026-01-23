import { NextResponse } from "next/server";
import { getCurrentForecast } from "@/lib/realtime/polling";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const forecast = await getCurrentForecast();
    return NextResponse.json(forecast);
  } catch (error) {
    console.error("Error in forecast API:", error);

    // Fallback to default model
    const { runForecastModel } = await import("@/lib/model");
    const fallbackForecast = runForecastModel();

    return NextResponse.json(fallbackForecast);
  }
}
