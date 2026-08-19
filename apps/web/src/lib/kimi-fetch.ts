import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";

const encoder = new TextEncoder();

export function createKimiFetch(
  apiKey: string,
  onEvent: (event: unknown) => void
): typeof fetch {
  const model = createAnthropic({
    apiKey,
    baseURL: "https://api.kimi.com/coding/v1",
  })("kimi-for-coding");

  return async (_input, init) => {
    const options = (await new Response(init?.body).json()) as Parameters<
      typeof model.doStream
    >[0];
    const emit = (type: string, event: unknown) => {
      try {
        onEvent({ type, event });
      } catch {
        // Observability must never break the model stream.
      }
    };

    emit("kimi-model-request", {
      tools: options.tools?.map((tool) => ({ name: tool.name, type: tool.type })) ?? [],
    });

    let result: Awaited<ReturnType<typeof model.doStream>>;
    try {
      result = await model.doStream({
        ...options,
        abortSignal: init?.signal ?? undefined,
      });
    } catch (error) {
      emit(
        "kimi-model-error",
        error instanceof Error ? error.message : "Model request failed"
      );
      throw error;
    }

    const reader = result.stream.getReader();

    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await reader.read();

          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          const part =
            value.type === "error"
              ? {
                  ...value,
                  error:
                    value.error instanceof Error
                      ? value.error.message
                      : String(value.error),
                }
              : value;
          emit("kimi-model-event", part);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(part)}\n\n`)
          );
        },
        cancel() {
          return reader.cancel();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  };
}
