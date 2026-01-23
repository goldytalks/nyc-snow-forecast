"use client";

import { Badge } from "@/components/ui/badge";
import { Clock, Activity } from "lucide-react";

interface StatusIndicatorProps {
  timestamp: string;
  sources: string[];
}

export function StatusIndicator({ timestamp, sources }: StatusIndicatorProps) {
  const date = new Date(timestamp);
  const formattedTime = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>Updated: {formattedTime}</span>
      </div>
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          LIVE
        </Badge>
      </div>
      <div className="hidden sm:flex items-center gap-1">
        {sources.slice(0, 3).map((source, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {source.replace("_", " ")}
          </Badge>
        ))}
        {sources.length > 3 && (
          <Badge variant="secondary" className="text-xs">
            +{sources.length - 3}
          </Badge>
        )}
      </div>
    </div>
  );
}
