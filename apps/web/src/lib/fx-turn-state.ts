import type {
  FxStreamEvent,
  FxTokenUsage,
  FxToolState,
} from "./fx-stream.ts";

export type FxActivity = {
  timestamp: number;
  source: "model" | "fx" | "runtime";
  name: string;
  detail?: string;
};

export type FxToolActivity = {
  id: string;
  name: string;
  state: FxToolState;
  input?: unknown;
  inputText?: string;
  output?: unknown;
  errorText?: string;
};

export type FxTurnDetails = {
  phase: "starting" | "streaming" | "complete" | "error";
  model?: string;
  reasoning: string;
  reasoningStreaming: boolean;
  tools: FxToolActivity[];
  usage?: FxTokenUsage;
  activities: FxActivity[];
  stopReason?: string;
  durationMs?: number;
  error?: string;
};

export const createFxTurnDetails = (): FxTurnDetails => ({
  phase: "starting",
  reasoning: "",
  reasoningStreaming: false,
  tools: [],
  activities: [],
});

const activity = (
  source: FxActivity["source"],
  name: string,
  timestamp: number,
  detail?: string
): FxActivity => ({
  source,
  name,
  timestamp,
  ...(detail ? { detail } : {}),
});

const updateTool = (
  tools: FxToolActivity[],
  event: Extract<FxStreamEvent, { type: "tool" }>
): FxToolActivity[] => {
  const current = tools.find((tool) => tool.id === event.toolCallId);
  const next: FxToolActivity = {
    id: event.toolCallId,
    name: event.name === "tool" && current ? current.name : event.name,
    state: event.state,
    ...(current?.input !== undefined ? { input: current.input } : {}),
    ...(current?.inputText ? { inputText: current.inputText } : {}),
    ...(current?.output !== undefined ? { output: current.output } : {}),
    ...(current?.errorText ? { errorText: current.errorText } : {}),
    ...(event.input !== undefined ? { input: event.input } : {}),
    ...(event.inputDelta
      ? { inputText: `${current?.inputText ?? ""}${event.inputDelta}` }
      : {}),
    ...(event.output !== undefined ? { output: event.output } : {}),
    ...(event.errorText ? { errorText: event.errorText } : {}),
  };

  return current
    ? tools.map((tool) => (tool.id === event.toolCallId ? next : tool))
    : [...tools, next];
};

export function applyFxStreamEvent(
  details: FxTurnDetails,
  event: FxStreamEvent
): { details: FxTurnDetails; textDelta?: string } {
  switch (event.type) {
    case "turn-start":
      return {
        details: {
          ...details,
          phase: "streaming",
          model: event.model,
          activities: [
            ...details.activities,
            activity("runtime", "turn-start", event.timestamp, event.model),
          ],
        },
      };
    case "status":
      return {
        details: {
          ...details,
          reasoningStreaming:
            event.name === "reasoning-start"
              ? true
              : event.name === "reasoning-end"
                ? false
                : details.reasoningStreaming,
          activities: [
            ...details.activities,
            activity(event.source, event.name, event.timestamp, event.detail),
          ],
        },
      };
    case "reasoning-delta":
      return {
        details: {
          ...details,
          reasoning: `${details.reasoning}${event.delta}`,
          reasoningStreaming: true,
        },
      };
    case "text-delta":
      return { details, textDelta: event.delta };
    case "tool":
      return {
        details: {
          ...details,
          tools: updateTool(details.tools, event),
        },
      };
    case "usage":
      return {
        details: {
          ...details,
          usage: event.usage,
          activities: [
            ...details.activities,
            activity(
              "model",
              "token-usage",
              event.timestamp,
              `${event.usage.total} total`
            ),
          ],
        },
      };
    case "finish":
      return {
        details: {
          ...details,
          phase: "complete",
          reasoningStreaming: false,
          stopReason: event.stopReason,
          durationMs: event.durationMs,
          activities: [
            ...details.activities,
            activity(
              "runtime",
              "turn-finish",
              event.timestamp,
              event.stopReason
            ),
          ],
        },
      };
    case "error":
      return {
        details: {
          ...details,
          phase: "error",
          reasoningStreaming: false,
          error: event.message,
          activities: [
            ...details.activities,
            activity("runtime", "error", event.timestamp, event.message),
          ],
        },
      };
  }
}
