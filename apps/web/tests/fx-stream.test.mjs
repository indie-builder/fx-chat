import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeFxStreamEvent,
  normalizeFxUpdate,
  normalizeHostEvent,
  normalizeModelEvent,
  readFxEventStream,
} from "../src/lib/fx-stream.ts";
import {
  applyFxStreamEvent,
  createFxTurnDetails,
} from "../src/lib/fx-turn-state.ts";

test("keeps official host events as lifecycle status", () => {
  assert.deepEqual(normalizeHostEvent({ type: "runtime.started" }, 1), [
    {
      type: "status",
      source: "runtime",
      name: "runtime.started",
      timestamp: 1,
    },
  ]);
});

test("normalizes Kimi reasoning and token usage", () => {
  assert.deepEqual(
    normalizeHostEvent(
      {
        type: "kimi-model-event",
        event: { type: "reasoning-delta", delta: "think" },
      },
      1
    ),
    [{ type: "reasoning-delta", timestamp: 1, delta: "think" }]
  );

  const events = normalizeModelEvent(
    {
      type: "finish",
      usage: {
        inputTokens: { total: 14, noCache: 10, cacheRead: 4, cacheWrite: 0 },
        outputTokens: { total: 21, text: 5, reasoning: 16 },
      },
    },
    2
  );

  assert.deepEqual(events[0], {
    type: "usage",
    timestamp: 2,
    usage: {
      input: { total: 14, noCache: 10, cacheRead: 4, cacheWrite: 0 },
      output: { total: 21, text: 5, reasoning: 16 },
      total: 35,
    },
  });
});

test("keeps runtime diagnostics out of assistant text", () => {
  assert.equal(
    normalizeFxUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { text: "skill discovery warning: invalid skill" },
    })[0].type,
    "status"
  );
  assert.deepEqual(
    normalizeFxUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { text: "answer" },
    }, 3),
    [{ type: "text-delta", timestamp: 3, delta: "answer" }]
  );
});

test("decodes NDJSON split across transport chunks", async () => {
  const first = {
    type: "status",
    source: "runtime",
    name: "runtime.started",
    timestamp: 1,
  };
  const second = { type: "text-delta", timestamp: 2, delta: "answer" };
  const bytes = new Uint8Array([
    ...encodeFxStreamEvent(first),
    ...encodeFxStreamEvent(second),
  ]);
  const events = [];
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 17));
      controller.enqueue(bytes.slice(17));
      controller.close();
    },
  });

  await readFxEventStream(stream, (event) => events.push(event));
  assert.deepEqual(events, [first, second]);
});

test("reduces reasoning, tools, usage, and finish into one turn", () => {
  let details = createFxTurnDetails();
  for (const event of [
    { type: "reasoning-delta", timestamp: 1, delta: "think" },
    {
      type: "tool",
      timestamp: 2,
      toolCallId: "tool-1",
      name: "read",
      state: "input-available",
    },
    {
      type: "usage",
      timestamp: 3,
      usage: {
        input: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        output: { total: 5, text: 3, reasoning: 2 },
        total: 15,
      },
    },
    {
      type: "finish",
      timestamp: 4,
      stopReason: "end_turn",
      durationMs: 120,
    },
  ]) {
    details = applyFxStreamEvent(details, event).details;
  }

  assert.equal(details.reasoning, "think");
  assert.equal(details.tools[0].name, "read");
  assert.equal(details.usage.total, 15);
  assert.equal(details.phase, "complete");
  assert.equal(details.durationMs, 120);
});
