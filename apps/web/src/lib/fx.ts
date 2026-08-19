import "server-only";

import path from "node:path";
import { createFxAgent, type FxAgent, type FxSession } from "libfx";
import { DEFAULT_FX_MODEL } from "@/lib/fx-model";

type FxRuntime = {
  agent: FxAgent;
  session: FxSession;
};

declare global {
  var fxRuntime: Promise<FxRuntime> | undefined;
}

async function createRuntime(): Promise<FxRuntime> {
  const agent = await createFxAgent({
    backend: "native",
    env: {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      FX_MODEL: process.env.FX_MODEL?.trim() || DEFAULT_FX_MODEL,
    },
    workspaceRoot:
      process.env.FX_WORKSPACE_ROOT ?? path.resolve(process.cwd(), "../.."),
    onPermission: async () => null,
  });

  return { agent, session: await agent.createSession() };
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
