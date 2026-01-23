"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Scenario } from "@/lib/types";

interface ScenarioBreakdownProps {
  scenarios: Scenario[];
}

export function ScenarioBreakdown({ scenarios }: ScenarioBreakdownProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium">Scenarios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {scenarios.map((scenario, index) => {
          const percent = Math.round(scenario.probability * 100);

          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate pr-2">{scenario.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {percent}% | {scenario.snowfallRange[0]}-{scenario.snowfallRange[1]}&quot;
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: scenario.color,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{scenario.description}</p>
            </div>
          );
        })}

        {/* Stacked visualization */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Probability Distribution</p>
          <div className="h-6 rounded-full overflow-hidden flex">
            {scenarios.map((scenario, index) => (
              <div
                key={index}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${scenario.probability * 100}%`,
                  backgroundColor: scenario.color,
                }}
                title={`${scenario.name}: ${Math.round(scenario.probability * 100)}%`}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
