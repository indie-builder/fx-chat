import type { FxTurn } from "libfx";
import { getFxRuntime, resetFxRuntime } from "@/lib/fx";
import { getFxDisplayModel, isFxConfigured } from "@/lib/fx-model";
import {
  encodeFxStreamEvent,
  normalizeFxUpdate,
  normalizeHostEvent,
  type FxStreamEvent,
} from "@/lib/fx-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxPromptLength = 12_000;

export async function POST(request: Request) {
  if (!isFxConfigured()) {
    return Response.json(
      { error: "KIMI_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let prompt: unknown;

  try {
    ({ prompt } = (await request.json()) as { prompt?: unknown });
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  if (prompt.length > maxPromptLength) {
    return Response.json(
      { error: `Prompt must be ${maxPromptLength} characters or fewer.` },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  let turn: FxTurn;
  let pendingHostEvents: unknown[] = [];
  let handleHostEvent = (event: unknown) => {
    pendingHostEvents.push(event);
  };
  let unsubscribe = () => {};

  try {
    const runtime = await getFxRuntime();
    unsubscribe = runtime.subscribe((event) => handleHostEvent(event));
    const { session } = runtime;
    turn = session.prompt(prompt.trim(), { signal: request.signal });
  } catch (error) {
    unsubscribe();
    const busy =
      error instanceof Error && error.message.includes("already in progress");
    return Response.json(
      { error: busy ? "FX is already handling another prompt." : "FX failed to start." },
      { status: busy ? 409 : 500 }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: FxStreamEvent) => {
        if (!closed) controller.enqueue(encodeFxStreamEvent(event));
      };
      const publishHostEvent = (event: unknown) => {
        for (const normalized of normalizeHostEvent(event)) send(normalized);
      };

      send({
        type: "turn-start",
        timestamp: startedAt,
        model: getFxDisplayModel(),
      });
      handleHostEvent = publishHostEvent;
      for (const event of pendingHostEvents) publishHostEvent(event);
      pendingHostEvents = [];

      void (async () => {
        try {
          for await (const update of turn) {
            for (const normalized of normalizeFxUpdate(update)) send(normalized);
          }

          const stopReason = await turn.stopReason;
          send({
            type: "finish",
            timestamp: Date.now(),
            stopReason,
            durationMs: Date.now() - startedAt,
          });
          closed = true;
          controller.close();
        } catch (error) {
          send({
            type: "error",
            timestamp: Date.now(),
            message: error instanceof Error ? error.message : "FX stream failed.",
          });
          closed = true;
          controller.close();
        } finally {
          unsubscribe();
        }
      })();
    },
    cancel() {
      unsubscribe();
      turn.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE() {
  await resetFxRuntime();
  return new Response(null, { status: 204 });
}
