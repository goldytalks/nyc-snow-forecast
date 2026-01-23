"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, Wifi, WifiOff } from "lucide-react";

interface StatusIndicatorProps {
  timestamp: string;
  sources: string[];
  isConnected?: boolean;
  lastUpdate?: Date | null;
}

export function StatusIndicator({
  sources,
  isConnected = true,
}: StatusIndicatorProps) {
  // Start with null to avoid hydration mismatch
  const [currentTime, setCurrentTime] = useState<string | null>(null);

  useEffect(() => {
    // Set initial time on client only
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

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

      {/* Current Time (Real-time) */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span className="font-mono min-w-[180px]">
          {currentTime || "Loading..."}
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
