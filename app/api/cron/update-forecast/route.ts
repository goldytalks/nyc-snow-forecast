/**
 * Cron endpoint for scheduled forecast updates
 * Called by Vercel cron every 15 minutes
 */

import { NextResponse } from "next/server";
import { pollingManager } from "@/lib/realtime/polling";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log(`[CRON] Starting forecast update at ${new Date().toISOString()}`);

    const forecast = await pollingManager.fetchAndUpdate();

    if (!forecast) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to fetch forecast",
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Forecast updated",
      timestamp: new Date().toISOString(),
      summary: {
        median: forecast.distribution.median,
        mean: forecast.distribution.mean,
        p10: forecast.distribution.p10,
        p90: forecast.distribution.p90,
      },
    });
  } catch (error) {
    console.error("[CRON] Error updating forecast:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
