import { getCurrentForecast } from "@/lib/realtime/polling";
import { runForecastModel } from "@/lib/model";
import { ModelNotesClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getForecast() {
  try {
    return await getCurrentForecast();
  } catch {
    return runForecastModel();
  }
}

export default async function ModelNotesPage() {
  const forecast = await getForecast();
  return <ModelNotesClient forecast={forecast} />;
}
