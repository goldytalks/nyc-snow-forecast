"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Scenario } from "@/lib/types";

interface ScenarioBreakdownProps {
  scenarios: Scenario[];
}

interface ScenarioRowProps {
  scenario: Scenario;
  index: number;
  isActive: boolean;
  onHover: (index: number | null) => void;
}

function ScenarioRow({ scenario, index, isActive, onHover }: ScenarioRowProps) {
  const percent = Math.round(scenario.probability * 100);

  return (
    <div
      className={`
        space-y-1.5 p-2 -mx-2 rounded-lg cursor-pointer
        transition-all duration-300 ease-out
        ${isActive ? "bg-white/5" : "hover:bg-white/[0.02]"}
      `}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {/* Color indicator dot */}
          <div
            className={`
              w-2 h-2 rounded-full transition-all duration-300
              ${isActive ? "scale-150" : ""}
            `}
            style={{
              backgroundColor: scenario.color,
              boxShadow: isActive ? `0 0 8px ${scenario.color}` : "none",
            }}
          />
          <span
            className={`
              font-medium truncate pr-2 transition-colors duration-300
              ${isActive ? "text-white" : ""}
            `}
          >
            {scenario.name}
          </span>
        </div>
        <span
          className={`
            shrink-0 transition-colors duration-300 font-mono text-xs
            ${isActive ? "text-white" : "text-muted-foreground"}
          `}
        >
          {percent}% | {scenario.snowfallRange[0]}-{scenario.snowfallRange[1]}&quot;
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="h-2 rounded-full bg-secondary/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: isActive ? "100%" : `${percent}%`,
            backgroundColor: scenario.color,
            opacity: isActive ? 1 : 0.8,
            boxShadow: isActive ? `0 0 12px ${scenario.color}` : "none",
          }}
        />
      </div>

      {/* Description with fade animation */}
      <p
        className={`
          text-xs transition-all duration-300
          ${isActive ? "text-muted-foreground" : "text-muted-foreground/70"}
        `}
      >
        {scenario.description}
      </p>
    </div>
  );
}

export function ScenarioBreakdown({ scenarios }: ScenarioBreakdownProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          Scenarios
          {activeIndex !== null && (
            <span
              className="text-xs font-normal px-2 py-0.5 rounded-full animate-fade-in"
              style={{
                backgroundColor: `${scenarios[activeIndex].color}20`,
                color: scenarios[activeIndex].color,
              }}
            >
              {Math.round(scenarios[activeIndex].probability * 100)}% probability
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {scenarios.map((scenario, index) => (
          <ScenarioRow
            key={index}
            scenario={scenario}
            index={index}
            isActive={activeIndex === index}
            onHover={setActiveIndex}
          />
        ))}

        {/* Interactive stacked visualization */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Probability Distribution</p>
          <div className="h-8 rounded-full overflow-hidden flex relative">
            {scenarios.map((scenario, index) => {
              const isActive = activeIndex === index;
              return (
                <div
                  key={index}
                  className={`
                    h-full first:rounded-l-full last:rounded-r-full
                    transition-all duration-300 ease-out cursor-pointer
                    relative group
                  `}
                  style={{
                    width: `${scenario.probability * 100}%`,
                    backgroundColor: scenario.color,
                    opacity: activeIndex === null || isActive ? 1 : 0.4,
                    transform: isActive ? "scaleY(1.15)" : "scaleY(1)",
                    zIndex: isActive ? 10 : 1,
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {/* Tooltip */}
                  <div
                    className={`
                      absolute -top-10 left-1/2 -translate-x-1/2
                      bg-[#0a0a0a] border border-border rounded px-2 py-1
                      text-xs whitespace-nowrap pointer-events-none
                      transition-all duration-200
                      ${isActive ? "opacity-100 visible" : "opacity-0 invisible"}
                    `}
                  >
                    <span style={{ color: scenario.color }}>
                      {Math.round(scenario.probability * 100)}%
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {scenario.snowfallRange[0]}-{scenario.snowfallRange[1]}&quot;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {scenarios.map((scenario, index) => (
              <div
                key={index}
                className={`
                  flex items-center gap-1.5 text-xs cursor-pointer
                  transition-opacity duration-300
                  ${activeIndex === null || activeIndex === index ? "opacity-100" : "opacity-40"}
                `}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: scenario.color }}
                />
                <span className="text-muted-foreground">
                  {scenario.name.split(" - ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
