"use client";

import { Badge } from "@/components/ui/badge";
import { Clock, Activity, Wifi, WifiOff } from "lucide-react";

interface StatusIndicatorProps {
  timestamp: string;
  sources: string[];
  isConnected?: boolean;
  lastUpdate?: Date | null;
}

export function StatusIndicator({
  timestamp,
  sources,
  isConnected = true,
  lastUpdate,
}: StatusIndicatorProps) {
  // Use lastUpdate if available, otherwise fall back to timestamp
  const displayTime = lastUpdate || new Date(timestamp);
  const formattedTime = displayTime.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  // Calculate time since last update
  const timeSinceUpdate = lastUpdate
    ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    : null;

  const getTimeAgo = () => {
    if (!timeSinceUpdate) return null;
    if (timeSinceUpdate < 60) return "just now";
    if (timeSinceUpdate < 3600)
      return `${Math.floor(timeSinceUpdate / 60)}m ago`;
    return `${Math.floor(timeSinceUpdate / 3600)}h ago`;
  };

  const timeAgo = getTimeAgo();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            >
              <Wifi className="w-3 h-3 mr-1" />
              LIVE
            </Badge>
          </>
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <Badge
              variant="secondary"
              className="bg-amber-500/10 text-amber-400 border-amber-500/20"
            >
              <WifiOff className="w-3 h-3 mr-1" />
              OFFLINE
            </Badge>
          </>
        )}
      </div>

      {/* Last Update Time */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>
          {formattedTime}
          {timeAgo && (
            <span className="text-xs ml-1 text-muted-foreground/70">
              ({timeAgo})
            </span>
          )}
        </span>
      </div>

      {/* Data Sources */}
      <div className="hidden sm:flex items-center gap-1">
        {sources.slice(0, 3).map((source, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {source.replace(/_/g, " ")}
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
