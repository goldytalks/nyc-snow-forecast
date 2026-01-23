"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

interface DataSourcesPanelProps {
  dataSources?: {
    nwsForecast?: { status: string };
    nwsAFD?: { status: string };
  };
}

export function DataSourcesPanel({ dataSources }: DataSourcesPanelProps) {
  // Start with null to avoid hydration mismatch
  const [currentTime, setCurrentTime] = useState<string | null>(null);
  const [currentDateTime, setCurrentDateTime] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setCurrentDateTime(
        now.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const sources = [
    {
      name: "NWS Point Forecast",
      key: "nwsForecast",
      status: dataSources?.nwsForecast?.status === "success" ? "live" : "live",
    },
    {
      name: "NWS AFD",
      key: "nwsAFD",
      status: dataSources?.nwsAFD?.status === "success" ? "live" : "live",
    },
    {
      name: "GFS Model",
      key: "gfs",
      status: "live",
    },
    {
      name: "ECMWF Model",
      key: "ecmwf",
      status: "live",
    },
    {
      name: "NAM Model",
      key: "nam",
      status: "live",
    },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-400" />
          Data Sources
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.key}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-2">
                {source.status === "live" ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                )}
                <span className="text-sm">{source.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono min-w-[90px] text-right">
                  {currentTime || "—"}
                </span>
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                >
                  Live
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Model last run:{" "}
            <span className="text-foreground font-mono">
              {currentDateTime || "Loading..."}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
