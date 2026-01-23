"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ProbabilityChartProps {
  strikeProbabilities: Record<string, number>;
}

export function ProbabilityChart({ strikeProbabilities }: ProbabilityChartProps) {
  // Convert to array and add 0" data point
  const data = [
    { threshold: 0, probability: 100 },
    ...Object.entries(strikeProbabilities)
      .map(([threshold, prob]) => ({
        threshold: parseFloat(threshold),
        probability: Math.round(prob * 100),
      }))
      .sort((a, b) => a.threshold - b.threshold),
  ];

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">
          Probability Distribution
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          P(Snow &gt; X inches) - Hover for details
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="threshold"
                stroke="#525252"
                tick={{ fill: "#a3a3a3", fontSize: 12 }}
                tickFormatter={(value) => `${value}"`}
              />
              <YAxis
                stroke="#525252"
                tick={{ fill: "#a3a3a3", fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111111",
                  border: "1px solid #1f1f1f",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#fafafa" }}
                formatter={(value) => [`${value}%`, "Probability"]}
                labelFormatter={(label) => `Snow > ${label}"`}
              />
              <ReferenceLine
                x={10}
                stroke="#10b981"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="probability"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorProb)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
