"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ModelInput } from "@/lib/types";

interface ModelComparisonProps {
  modelInputs: Record<string, ModelInput>;
}

const MODEL_NAMES: Record<string, string> = {
  nws: "NWS Official",
  ecmwf: "ECMWF (Euro)",
  gfs: "GFS",
  nam: "NAM",
};

const MODEL_ORDER = ["nws", "ecmwf", "gfs", "nam"];

export function ModelComparison({ modelInputs }: ModelComparisonProps) {
  const maxValue = Math.max(
    ...Object.values(modelInputs).map((m) => {
      if (m.range) return m.range[1];
      if (m.value) return m.value;
      return 0;
    })
  );

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium">Model Inputs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {MODEL_ORDER.map((key) => {
          const model = modelInputs[key];
          if (!model) return null;

          const displayValue = model.range
            ? `${model.range[0]}-${model.range[1]}"`
            : `${model.value}"`;

          const barWidth = model.range
            ? (model.range[1] / maxValue) * 100
            : ((model.value || 0) / maxValue) * 100;

          const TrendIcon = model.trend === "up"
            ? TrendingUp
            : model.trend === "down"
            ? TrendingDown
            : Minus;

          const trendColor = model.trend === "up"
            ? "text-emerald-400"
            : model.trend === "down"
            ? "text-red-400"
            : "text-muted-foreground";

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{MODEL_NAMES[key]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-mono">{displayValue}</span>
                  {model.trend && (
                    <TrendIcon className={`w-4 h-4 ${trendColor}`} />
                  )}
                </div>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="pt-3 mt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <Badge
              variant="secondary"
              className="bg-amber-500/10 text-amber-400 border-amber-500/20"
            >
              {modelInputs.nws?.confidence?.toUpperCase() || "MEDIUM"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
