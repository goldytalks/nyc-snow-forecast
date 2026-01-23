"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Snowflake } from "lucide-react";
import type { Distribution } from "@/lib/types";

interface HeroForecastProps {
  distribution: Distribution;
}

export function HeroForecast({ distribution }: HeroForecastProps) {
  return (
    <Card className="glass border-emerald-500/20 glow-emerald">
      <CardContent className="pt-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Snowflake className="w-6 h-6 text-emerald-400 animate-pulse-slow" />
          <span className="text-sm font-medium text-emerald-400 uppercase tracking-wider">
            Expected Snowfall
          </span>
          <Snowflake className="w-6 h-6 text-emerald-400 animate-pulse-slow" />
        </div>

        <div className="relative">
          <span className="text-7xl md:text-8xl font-bold bg-gradient-to-b from-white to-emerald-200 bg-clip-text text-transparent glow-text">
            {distribution.median.toFixed(1)}&quot;
          </span>
        </div>

        <p className="text-muted-foreground mt-2 text-lg">
          Central Park Total
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Range: {distribution.p25.toFixed(0)}&quot; - {distribution.p75.toFixed(0)}&quot;
          </Badge>
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
            90% CI: {distribution.p10.toFixed(0)}&quot; - {distribution.p90.toFixed(0)}&quot;
          </Badge>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          Mean: {distribution.mean.toFixed(1)}&quot; | Std Dev: {distribution.stdDev.toFixed(1)}&quot;
        </div>
      </CardContent>
    </Card>
  );
}
