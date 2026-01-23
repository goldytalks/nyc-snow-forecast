"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface DataSourceStatus {
  status: string;
  updateTime?: string | null;
  issueTime?: string | null;
}

interface DataSourcesPanelProps {
  dataSources?: {
    nwsForecast?: DataSourceStatus;
    nwsAFD?: DataSourceStatus;
  };
  lastModelRun?: string;
}

export function DataSourcesPanel({
  dataSources,
  lastModelRun,
}: DataSourcesPanelProps) {
  const sources = [
    {
      name: "NWS Point Forecast",
      key: "nwsForecast",
      status: dataSources?.nwsForecast?.status || "unknown",
      time: dataSources?.nwsForecast?.updateTime,
    },
    {
      name: "NWS AFD",
      key: "nwsAFD",
      status: dataSources?.nwsAFD?.status || "unknown",
      time: dataSources?.nwsAFD?.issueTime,
    },
    {
      name: "GFS Model",
      key: "gfs",
      status: "manual",
      time: null,
    },
    {
      name: "ECMWF Model",
      key: "ecmwf",
      status: "manual",
      time: null,
    },
    {
      name: "NAM Model",
      key: "nam",
      status: "manual",
      time: null,
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-400" />;
      case "manual":
        return <RefreshCw className="w-4 h-4 text-blue-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            Live
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
            Error
          </Badge>
        );
      case "manual":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            Manual
          </Badge>
        );
      case "fallback":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
            Fallback
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Unknown
          </Badge>
        );
    }
  };

  const formatTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return "—";
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return timeStr;
    }
  };

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
                {getStatusIcon(source.status)}
                <span className="text-sm">{source.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatTime(source.time)}
                </span>
                {getStatusBadge(source.status)}
              </div>
            </div>
          ))}
        </div>

        {lastModelRun && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Model last run:{" "}
              <span className="text-foreground">
                {new Date(lastModelRun).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
