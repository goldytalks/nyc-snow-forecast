"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface StrikeCardsProps {
  strikeProbabilities: Record<string, number>;
}

const DISPLAY_STRIKES = ["4", "8", "12", "15", "18"];

function getColorConfig(percent: number) {
  if (percent >= 75) return {
    gradient: "from-emerald-500 to-emerald-400",
    text: "text-emerald-400",
    glow: "shadow-emerald-500/30",
    ring: "ring-emerald-500/50",
    bg: "bg-emerald-500",
  };
  if (percent >= 50) return {
    gradient: "from-blue-500 to-blue-400",
    text: "text-blue-400",
    glow: "shadow-blue-500/30",
    ring: "ring-blue-500/50",
    bg: "bg-blue-500",
  };
  if (percent >= 25) return {
    gradient: "from-amber-500 to-amber-400",
    text: "text-amber-400",
    glow: "shadow-amber-500/30",
    ring: "ring-amber-500/50",
    bg: "bg-amber-500",
  };
  return {
    gradient: "from-red-500 to-red-400",
    text: "text-red-400",
    glow: "shadow-red-500/30",
    ring: "ring-red-500/50",
    bg: "bg-red-500",
  };
}

interface StrikeCardProps {
  strike: string;
  probability: number;
  index: number;
}

function StrikeCard({ strike, probability, index }: StrikeCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const percent = Math.round(probability * 100);
  const colors = getColorConfig(percent);

  return (
    <Card
      className={`
        glass overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        hover:scale-105 hover:shadow-lg ${isHovered ? colors.glow : ""}
        ${isHovered ? `ring-1 ${colors.ring}` : ""}
      `}
      style={{
        animationDelay: `${index * 100}ms`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="pt-4 pb-4 text-center relative">
        {/* Background glow on hover */}
        <div
          className={`
            absolute inset-0 opacity-0 transition-opacity duration-300
            bg-gradient-to-t ${colors.gradient}
            ${isHovered ? "opacity-5" : ""}
          `}
        />

        {/* Threshold label */}
        <p className={`
          text-xs uppercase tracking-wider mb-1 transition-colors duration-300
          ${isHovered ? colors.text : "text-muted-foreground"}
        `}>
          &gt;{strike}&quot;
        </p>

        {/* Main percentage with animated counter effect */}
        <div className="relative">
          <p className={`
            text-3xl font-bold transition-all duration-300
            ${isHovered ? `${colors.text} scale-110` : "text-foreground"}
          `}>
            {percent}%
          </p>
        </div>

        {/* Animated progress bar */}
        <div className="mt-3 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
          <div
            className={`
              h-full rounded-full bg-gradient-to-r ${colors.gradient}
              transition-all duration-500 ease-out
            `}
            style={{
              width: `${percent}%`,
              boxShadow: isHovered ? `0 0 10px currentColor` : "none",
            }}
          />
        </div>

        {/* Hover tooltip */}
        <div className={`
          absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full
          bg-[#0a0a0a] border border-border rounded px-2 py-1
          text-xs text-muted-foreground whitespace-nowrap
          transition-all duration-200
          ${isHovered ? "opacity-100 visible" : "opacity-0 invisible"}
        `}>
          {percent >= 50 ? "Likely" : percent >= 25 ? "Possible" : "Unlikely"}
        </div>
      </CardContent>
    </Card>
  );
}

export function StrikeCards({ strikeProbabilities }: StrikeCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {DISPLAY_STRIKES.map((strike, index) => (
        <StrikeCard
          key={strike}
          strike={strike}
          probability={strikeProbabilities[strike] || 0}
          index={index}
        />
      ))}
    </div>
  );
}
