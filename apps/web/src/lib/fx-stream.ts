export type FxToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

export type FxTokenUsage = {
  input: {
    total: number;
    noCache: number;
    cacheRead: number;
    cacheWrite: number;
  };
  output: {
    total: number;
    text: number;
    reasoning: number;
  };
  total: number;
};

export type FxStreamEvent =
  | {
      type: "turn-start";
      timestamp: number;
      model: string;
    }
  | {
      type: "status";
      timestamp: number;
      source: "model" | "fx" | "runtime";
      name: string;
      detail?: string;
    }
  | {
      type: "reasoning-delta";
      timestamp: number;
      delta: string;
    }
  | {
      type: "text-delta";
      timestamp: number;
      delta: string;
    }
  | {
      type: "tool";
      timestamp: number;
      toolCallId: string;
      name: string;
      state: FxToolState;
      input?: unknown;
      inputDelta?: string;
      output?: unknown;
      errorText?: string;
    }
  | {
      type: "usage";
      timestamp: number;
      usage: FxTokenUsage;
    }
  | {
      type: "finish";
      timestamp: number;
      stopReason: string;
      durationMs: number;
    }
  | {
      type: "error";
      timestamp: number;
      message: string;
    };

type UnknownRecord = Record<string, unknown>;

const encoder = new TextEncoder();

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const numberValue = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const parseInput = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const status = (
  source: "model" | "fx" | "runtime",
  name: string,
  timestamp: number,
  detail?: string
): FxStreamEvent => ({
  type: "status",
  source,
  name,
  timestamp,
  ...(detail ? { detail } : {}),
});

export function normalizeHostEvent(
  value: unknown,
  timestamp = Date.now()
): FxStreamEvent[] {
  if (!isRecord(value) || typeof value.type !== "string") {
    return [status("runtime", "unknown-event", timestamp)];
  }

  if (value.type === "kimi-model-event") {
    return normalizeModelEvent(value.event, timestamp);
  }

  if (value.type === "kimi-model-request") {
    const tools =
      isRecord(value.event) && Array.isArray(value.event.tools)
        ? value.event.tools.length
        : 0;
    return [status("model", "request", timestamp, `${tools} tools`)];
  }

  if (value.type === "kimi-model-error") {
    return [
      status(
        "model",
        "error",
        timestamp,
        typeof value.event === "string" ? value.event : "Model request failed"
      ),
    ];
  }

  return [status("runtime", value.type, timestamp)];
}

export function normalizeModelEvent(
  value: unknown,
  timestamp = Date.now()
): FxStreamEvent[] {
  if (!isRecord(value) || typeof value.type !== "string") {
    return [status("model", "unknown-event", timestamp)];
  }

  switch (value.type) {
    case "reasoning-start":
    case "reasoning-end":
    case "text-start":
    case "text-end":
    case "stream-start":
      return [status("model", value.type, timestamp)];
    case "response-metadata":
      return [
        status(
          "model",
          value.type,
          timestamp,
          [stringValue(value.modelId), stringValue(value.id)]
            .filter(Boolean)
            .join(" · ") || undefined
        ),
      ];
    case "reasoning-delta":
      return [
        {
          type: "reasoning-delta",
          timestamp,
          delta: stringValue(value.delta) ?? "",
        },
      ];
    case "tool-input-start":
      return [
        {
          type: "tool",
          timestamp,
          toolCallId: stringValue(value.id) ?? "unknown-tool",
          name: stringValue(value.toolName) ?? "tool",
          state: "input-streaming",
        },
      ];
    case "tool-input-delta":
      return [
        {
          type: "tool",
          timestamp,
          toolCallId: stringValue(value.id) ?? "unknown-tool",
          name: stringValue(value.toolName) ?? "tool",
          state: "input-streaming",
          inputDelta: stringValue(value.delta) ?? "",
        },
      ];
    case "tool-input-end":
      return [
        {
          type: "tool",
          timestamp,
          toolCallId: stringValue(value.id) ?? "unknown-tool",
          name: stringValue(value.toolName) ?? "tool",
          state: "input-available",
        },
      ];
    case "tool-call": {
      const name = stringValue(value.toolName) ?? "tool";
      return [
        {
          type: "tool",
          timestamp,
          toolCallId: stringValue(value.toolCallId) ?? "unknown-tool",
          name,
          state: "input-available",
          input: parseInput(value.input),
        },
        status("model", "tool-call", timestamp, name),
      ];
    }
    case "finish": {
      const input = isRecord(value.usage) && isRecord(value.usage.inputTokens)
        ? value.usage.inputTokens
        : {};
      const output = isRecord(value.usage) && isRecord(value.usage.outputTokens)
        ? value.usage.outputTokens
        : {};
      const usage: FxTokenUsage = {
        input: {
          total: numberValue(input.total),
          noCache: numberValue(input.noCache),
          cacheRead: numberValue(input.cacheRead),
          cacheWrite: numberValue(input.cacheWrite),
        },
        output: {
          total: numberValue(output.total),
          text: numberValue(output.text),
          reasoning: numberValue(output.reasoning),
        },
        total: numberValue(input.total) + numberValue(output.total),
      };
      return [
        { type: "usage", timestamp, usage },
        status("model", "finish", timestamp),
      ];
    }
    case "error":
      return [
        status(
          "model",
          "error",
          timestamp,
          stringValue(value.error) ?? "Model stream failed"
        ),
      ];
    default:
      return [status("model", value.type, timestamp)];
  }
}

const toolState = (value: unknown): FxToolState => {
  switch (value) {
    case "pending":
      return "input-streaming";
    case "in_progress":
      return "input-available";
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    default:
      return "input-streaming";
  }
};

const toolOutput = (update: UnknownRecord): unknown => {
  if (update.command_result !== undefined) return update.command_result;
  if (!Array.isArray(update.content)) return undefined;
  const text = update.content
    .map((item) => {
      if (!isRecord(item) || !isRecord(item.content)) return undefined;
      return stringValue(item.content.text);
    })
    .filter((part): part is string => Boolean(part))
    .join("\n");
  return text || undefined;
};

export function normalizeFxUpdate(
  value: unknown,
  timestamp = Date.now()
): FxStreamEvent[] {
  if (!isRecord(value) || typeof value.sessionUpdate !== "string") {
    return [status("fx", "unknown-update", timestamp)];
  }

  if (value.sessionUpdate === "agent_message_chunk") {
    const text = isRecord(value.content) ? stringValue(value.content.text) : undefined;
    if (!text) return [];
    if (text.startsWith("[context]")) {
      return [status("runtime", "context", timestamp, text)];
    }
    if (text.startsWith("skill discovery warning:")) {
      return [status("runtime", "skill-warning", timestamp, text)];
    }
    return [{ type: "text-delta", timestamp, delta: text }];
  }

  if (value.sessionUpdate === "tool_call") {
    const name = stringValue(value.title) ?? stringValue(value.kind) ?? "tool";
    return [
      {
        type: "tool",
        timestamp,
        toolCallId: stringValue(value.toolCallId) ?? "unknown-tool",
        name,
        state: toolState(value.status),
      },
      status("fx", "tool-call", timestamp, name),
    ];
  }

  if (value.sessionUpdate === "tool_call_update") {
    const failed = value.status === "failed";
    const output = toolOutput(value);
    return [
      {
        type: "tool",
        timestamp,
        toolCallId: stringValue(value.toolCallId) ?? "unknown-tool",
        name: "tool",
        state: toolState(value.status),
        ...(failed ? { errorText: String(output ?? "Tool failed") } : { output }),
      },
      status("fx", "tool-update", timestamp, stringValue(value.status)),
    ];
  }

  return [status("fx", value.sessionUpdate, timestamp)];
}

export function encodeFxStreamEvent(event: FxStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function readFxEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: FxStreamEvent) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (final = false) => {
    buffer += final ? decoder.decode() : "";
    const lines = buffer.split("\n");
    buffer = final ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as FxStreamEvent);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    consume();
  }

  consume(true);
  if (buffer.trim()) onEvent(JSON.parse(buffer) as FxStreamEvent);
}
