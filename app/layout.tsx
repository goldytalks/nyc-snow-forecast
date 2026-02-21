import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Snowfall Forecast | February 21-24, 2026",
  description: "Probabilistic snowfall prediction model for Central Park, NYC - Blizzard Event",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen noise-bg">
        {children}
      </body>
    </html>
  );
}
