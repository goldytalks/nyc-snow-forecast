/**
 * Server-Sent Events endpoint for real-time forecast updates
 */

import { getCurrentForecast } from "@/lib/realtime/polling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data
      try {
        const initialData = await getCurrentForecast();
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`)
        );
      } catch (error) {
        console.error("Error fetching initial forecast:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Failed to fetch initial data" })}\n\n`
          )
        );
      }

      // Set up interval to send updates every 60 seconds
      const interval = setInterval(async () => {
        try {
          const updatedData = await getCurrentForecast();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(updatedData)}\n\n`)
          );
        } catch (error) {
          console.error("Error fetching updated forecast:", error);
        }
      }, 60000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
