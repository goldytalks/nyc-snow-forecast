"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface UncertaintyPanelProps {
  uncertainties: string[];
}

export function UncertaintyPanel({ uncertainties }: UncertaintyPanelProps) {
  return (
    <Card className="glass border-amber-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          Key Uncertainties
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {uncertainties.map((uncertainty, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>{uncertainty}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
