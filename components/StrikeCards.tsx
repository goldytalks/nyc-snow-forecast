"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface StrikeCardsProps {
  strikeProbabilities: Record<string, number>;
}

const DISPLAY_STRIKES = ["4", "8", "12", "15", "18"];

export function StrikeCards({ strikeProbabilities }: StrikeCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {DISPLAY_STRIKES.map((strike) => {
        const probability = strikeProbabilities[strike] || 0;
        const percent = Math.round(probability * 100);

        // Color based on probability
        let colorClass = "bg-red-500";
        if (percent >= 75) colorClass = "bg-emerald-500";
        else if (percent >= 50) colorClass = "bg-blue-500";
        else if (percent >= 25) colorClass = "bg-amber-500";

        return (
          <Card key={strike} className="glass hover:border-emerald-500/30 transition-colors">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                &gt;{strike}&quot;
              </p>
              <p className="text-3xl font-bold text-foreground mb-2">
                {percent}%
              </p>
              <Progress
                value={percent}
                className="h-1.5 bg-secondary"
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
