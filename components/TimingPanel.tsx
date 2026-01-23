"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CloudSnow, Droplets, CloudOff } from "lucide-react";
import type { Timing } from "@/lib/types";

interface TimingPanelProps {
  timing: Timing;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function TimingPanel({ timing }: TimingPanelProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const getDisplayTime = (isoString: string) => {
    if (!isMounted) return "—";
    return formatTime(isoString);
  };

  const getMixingWindowDisplay = () => {
    if (!isMounted) return "—";
    return `${formatTime(timing.mixingWindow[0])} - ${formatTime(timing.mixingWindow[1]).split(" ").slice(1).join(" ")}`;
  };

  const events = [
    {
      icon: CloudSnow,
      label: "Snow Starts",
      time: timing.snowStarts,
      color: "text-blue-400",
      isRange: false,
    },
    {
      icon: CloudSnow,
      label: "Heaviest Snow",
      time: timing.heaviestSnow,
      color: "text-emerald-400",
      isRange: false,
    },
    {
      icon: Droplets,
      label: "Mixing Window",
      time: null,
      isRange: true,
      color: "text-amber-400",
    },
    {
      icon: CloudOff,
      label: "Snow Ends",
      time: timing.snowEnds,
      color: "text-muted-foreground",
      isRange: false,
    },
  ];

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Storm Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map((event, index) => (
            <div key={index} className="flex items-center gap-3">
              <event.icon className={`w-5 h-5 ${event.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{event.label}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {event.isRange ? getMixingWindowDisplay() : getDisplayTime(event.time as string)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
