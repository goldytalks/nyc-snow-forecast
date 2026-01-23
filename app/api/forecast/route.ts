import { NextResponse } from "next/server";
import forecastData from "@/data/forecast.json";

export async function GET() {
  return NextResponse.json(forecastData);
}
