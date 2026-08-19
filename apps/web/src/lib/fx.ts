import "server-only";

import path from "node:path";
import { createFxAgent, type FxAgent, type FxSession } from "libfx";
import { getFxModel } from "@/lib/fx-model";
import { createKimiFetch } from "@/lib/kimi-fetch";

type FxRuntime = {
  agent: FxAgent;
  session: FxSession;
  subscribe: (listener: (event: unknown) => void) => () => void;
};

declare global {
  var fxRuntime: Promise<FxRuntime> | undefined;
}

async function createRuntime(): Promise<FxRuntime> {
  const model = getFxModel();
  const kimiApiKey = process.env.KIMI_API_KEY?.trim();
  if (!kimiApiKey) throw new Error("KIMI_API_KEY is not configured.");
  const listeners = new Set<(event: unknown) => void>();
  const publish = (event: unknown) => {
    for (const listener of listeners) listener(event);
  };

  const agent = await createFxAgent({
    backend: "native",
    env: {
      AI_GATEWAY_API_KEY: "host-managed-kimi",
      FX_MODEL: model,
    },
    fetch: createKimiFetch(kimiApiKey, publish),
    workspaceRoot:
      process.env.FX_WORKSPACE_ROOT ?? path.resolve(process.cwd(), "../.."),
    onEvent: publish,
    onPermission: async (request) => {
      publish({ type: "permission-request", request });
      return null;
    },
  });

  return {
    agent,
    session: await agent.createSession(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function getFxRuntime(): Promise<FxRuntime> {
  // ponytail: one process-wide session is enough for this local demo; add
  // per-user session storage before deploying a multi-user application.
  globalThis.fxRuntime ??= createRuntime().catch((error) => {
    globalThis.fxRuntime = undefined;
    throw error;
  });

  return globalThis.fxRuntime;
}

export async function resetFxRuntime(): Promise<void> {
  const runtime = globalThis.fxRuntime;
  globalThis.fxRuntime = undefined;

  if (runtime) {
    await (await runtime).agent.close();
  }
}
