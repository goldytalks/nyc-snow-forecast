"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

interface ProbabilityChartProps {
  strikeProbabilities: Record<string, number>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { threshold: number; probability: number } }>;
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const prob = data.probability;
  const threshold = data.threshold;

  return (
    <div className="bg-[#0a0a0a]/95 backdrop-blur-md border border-emerald-500/30 rounded-lg p-3 shadow-xl shadow-emerald-500/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-emerald-400 font-medium text-sm">
          Snow &gt; {threshold}&quot;
        </span>
      </div>
      <div className="text-3xl font-bold text-white">
        {prob}%
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        probability of exceedance
      </div>
    </div>
  );
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { threshold: number; probability: number };
}

function CustomActiveDot({ cx, cy }: CustomDotProps) {
  if (cx === undefined || cy === undefined) return null;

  return (
    <g>
      {/* Outer glow */}
      <circle
        cx={cx}
        cy={cy}
        r={12}
        fill="#10b981"
        fillOpacity={0.2}
        className="animate-ping"
        style={{ animationDuration: "1.5s" }}
      />
      {/* Middle ring */}
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill="#10b981"
        fillOpacity={0.3}
      />
      {/* Inner dot */}
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#10b981"
        stroke="#fff"
        strokeWidth={2}
      />
    </g>
  );
}

export function ProbabilityChart({ strikeProbabilities }: ProbabilityChartProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Wait for mount with a small delay to ensure container has dimensions
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

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
    <Card className="glass overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          Probability Distribution
          {isHovered && (
            <span className="text-xs font-normal text-emerald-400 animate-fade-in">
              Interactive
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          P(Snow &gt; X inches) - Hover for details
        </p>
      </CardHeader>
      <CardContent>
        <div
          className="h-[280px] w-full"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {!isMounted ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={280}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                {/* Enhanced gradient with more color stops */}
                <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="30%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="70%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                {/* Glow filter for the line */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {/* Gradient for the stroke */}
                <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1f1f1f"
                vertical={false}
              />

              <XAxis
                dataKey="threshold"
                stroke="#525252"
                tick={{ fill: "#a3a3a3", fontSize: 12 }}
                tickFormatter={(value) => `${value}"`}
                axisLine={{ stroke: "#1f1f1f" }}
              />

              <YAxis
                stroke="#525252"
                tick={{ fill: "#a3a3a3", fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
                domain={[0, 100]}
                axisLine={{ stroke: "#1f1f1f" }}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: "#10b981",
                  strokeWidth: 1,
                  strokeDasharray: "5 5",
                  strokeOpacity: 0.5,
                }}
              />

              {/* Reference lines for key thresholds */}
              <ReferenceLine
                x={10}
                stroke="#10b981"
                strokeDasharray="3 3"
                strokeOpacity={0.3}
                label={{
                  value: "10\"",
                  position: "top",
                  fill: "#10b981",
                  fontSize: 10,
                  opacity: 0.7,
                }}
              />

              {/* Main area with animation */}
              <Area
                type="monotone"
                dataKey="probability"
                stroke="url(#strokeGradient)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorProb)"
                filter="url(#glow)"
                animationBegin={0}
                animationDuration={1500}
                animationEasing="ease-out"
                activeDot={<CustomActiveDot />}
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* Quick stats below chart */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-muted-foreground">P(&gt;8&quot;): </span>
              <span className="text-emerald-400 font-medium">
                {strikeProbabilities["8"] ? Math.round(strikeProbabilities["8"] * 100) : 0}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">P(&gt;12&quot;): </span>
              <span className="text-amber-400 font-medium">
                {strikeProbabilities["12"] ? Math.round(strikeProbabilities["12"] * 100) : 0}%
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Hover to explore
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
