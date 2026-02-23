"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface PolymarketBucketsProps {
  probabilities: Record<string, number>;
}

const BUCKET_ORDER = ["<8", "8-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20+"];

function getColorConfig(percent: number) {
  if (percent >= 25) return {
    gradient: "from-purple-500 to-purple-400",
    text: "text-purple-400",
    glow: "shadow-purple-500/30",
    ring: "ring-purple-500/50",
    bg: "bg-purple-500",
  };
  if (percent >= 15) return {
    gradient: "from-blue-500 to-blue-400",
    text: "text-blue-400",
    glow: "shadow-blue-500/30",
    ring: "ring-blue-500/50",
    bg: "bg-blue-500",
  };
  if (percent >= 8) return {
    gradient: "from-amber-500 to-amber-400",
    text: "text-amber-400",
    glow: "shadow-amber-500/30",
    ring: "ring-amber-500/50",
    bg: "bg-amber-500",
  };
  return {
    gradient: "from-zinc-500 to-zinc-400",
    text: "text-zinc-400",
    glow: "shadow-zinc-500/30",
    ring: "ring-zinc-500/50",
    bg: "bg-zinc-500",
  };
}

function BucketCard({ bucket, probability, maxProb }: { bucket: string; probability: number; maxProb: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const percent = Math.round(probability * 100);
  const colors = getColorConfig(percent);
  const isHighest = probability === maxProb && probability > 0;

  return (
    <Card
      className={`
        glass overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        hover:scale-105 hover:shadow-lg ${isHovered ? colors.glow : ""}
        ${isHovered ? `ring-1 ${colors.ring}` : ""}
        ${isHighest ? "ring-1 ring-purple-500/50" : ""}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="pt-4 pb-4 text-center relative">
        <div
          className={`
            absolute inset-0 opacity-0 transition-opacity duration-300
            bg-gradient-to-t ${colors.gradient}
            ${isHovered ? "opacity-5" : ""}
          `}
        />

        <p className={`
          text-xs uppercase tracking-wider mb-1 transition-colors duration-300
          ${isHovered ? colors.text : "text-muted-foreground"}
        `}>
          {bucket}&quot;
        </p>

        <div className="relative">
          <p className={`
            text-3xl font-bold transition-all duration-300
            ${isHovered ? `${colors.text} scale-110` : "text-foreground"}
          `}>
            {percent}%
          </p>
        </div>

        <div className="mt-3 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
          <div
            className={`
              h-full rounded-full bg-gradient-to-r ${colors.gradient}
              transition-all duration-500 ease-out
            `}
            style={{
              width: `${Math.min(percent * 2, 100)}%`,
              boxShadow: isHovered ? `0 0 10px currentColor` : "none",
            }}
          />
        </div>

        {isHighest && (
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-400 animate-pulse" />
        )}
      </CardContent>
    </Card>
  );
}

export function PolymarketBuckets({ probabilities }: PolymarketBucketsProps) {
  const maxProb = Math.max(...BUCKET_ORDER.map(b => probabilities[b] || 0));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
      {BUCKET_ORDER.map((bucket) => (
        <BucketCard
          key={bucket}
          bucket={bucket}
          probability={probabilities[bucket] || 0}
          maxProb={maxProb}
        />
      ))}
    </div>
  );
}
