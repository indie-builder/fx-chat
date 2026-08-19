declare module "libfx" {
  export type FxUpdate = {
    sessionUpdate?: string;
    content?: { text?: string };
  };

  export type FxTurn = AsyncIterable<FxUpdate> & {
    cancel(): void;
    stopReason: Promise<string>;
  };

  export type FxSession = {
    prompt(input: string, options?: { signal?: AbortSignal }): FxTurn;
    close(): Promise<void>;
  };

  export type FxAgent = {
    createSession(): Promise<FxSession>;
    close(): Promise<number>;
  };

  export function createFxAgent(options: {
    backend?: "auto" | "native" | "wasm";
    env?: Record<string, string | undefined>;
    workspaceRoot?: string;
    onPermission?: () => Promise<string | null>;
  }): Promise<FxAgent>;
}
