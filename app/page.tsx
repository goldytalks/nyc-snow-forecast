import { RealtimeProvider } from "@/components/RealtimeProvider";
import { Dashboard } from "@/components/Dashboard";
import { runForecastModel } from "@/lib/model";
import type { ForecastData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getInitialForecast(): Promise<ForecastData> {
  // Generate initial forecast data server-side
  const forecast = runForecastModel();

  return {
    modelRunTimestamp: forecast.modelRunTimestamp,
    dataSourcesUsed: forecast.dataSourcesUsed,
    distribution: forecast.distribution,
    strikeProbabilities: forecast.strikeProbabilities,
    scenarios: forecast.scenarios,
    modelInputs: forecast.modelInputs,
    keyUncertainties: forecast.keyUncertainties,
    timing: forecast.timing,
    dataSources: forecast.dataSources,
  };
}

export default async function Home() {
  const initialData = await getInitialForecast();

  return (
    <RealtimeProvider initialData={initialData}>
      <Dashboard initialData={initialData} />
    </RealtimeProvider>
  );
}
