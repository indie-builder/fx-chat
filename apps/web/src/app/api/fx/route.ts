import type { FxTurn } from "libfx";
import { getFxRuntime, resetFxRuntime } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const maxPromptLength = 12_000;

export async function POST(request: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      { error: "AI_GATEWAY_API_KEY is not configured." },
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

  let turn: FxTurn;

  try {
    const { session } = await getFxRuntime();
    turn = session.prompt(prompt.trim(), { signal: request.signal });
  } catch (error) {
    const busy =
      error instanceof Error && error.message.includes("already in progress");
    return Response.json(
      { error: busy ? "FX is already handling another prompt." : "FX failed to start." },
      { status: busy ? 409 : 500 }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          for await (const update of turn) {
            const text = update.content?.text;

            if (
              update.sessionUpdate === "agent_message_chunk" &&
              text &&
              !text.startsWith("[context]")
            ) {
              controller.enqueue(encoder.encode(text));
            }
          }

          await turn.stopReason;
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
    cancel() {
      turn.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE() {
  await resetFxRuntime();
  return new Response(null, { status: 204 });
}
