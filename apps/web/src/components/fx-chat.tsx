"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import type { ChatStatus } from "ai";
import { PlusIcon, TerminalSquareIcon } from "lucide-react";
import { useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function FxChat({
  configured,
  model,
}: {
  configured: boolean;
  model: string;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const abortController = useRef<AbortController | null>(null);
  const isBusy = status === "submitted" || status === "streaming";

  const updateAssistant = (id: string, content: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content } : message
      )
    );
  };

  const sendPrompt = async ({ text }: PromptInputMessage) => {
    const prompt = text.trim();
    if (!configured || !prompt || isBusy) return;

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const controller = new AbortController();
    abortController.current = controller;
    setInput("");
    setStatus("submitted");
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: prompt },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `FX request failed (${response.status}).`);
      }

      if (!response.body) throw new Error("FX returned an empty stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let content = "";
      setStatus("streaming");

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        updateAssistant(assistantId, content);
      }

      content += decoder.decode();
      updateAssistant(assistantId, content || "FX completed without a text response.");
      setStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistant(assistantId, "Stopped.");
        setStatus("ready");
      } else {
        const message = error instanceof Error ? error.message : "Unknown error.";
        updateAssistant(assistantId, `**FX error:** ${message}`);
        setStatus("error");
      }
    } finally {
      if (abortController.current === controller) abortController.current = null;
    }
  };

  const stop = () => abortController.current?.abort();

  const reset = async () => {
    stop();
    setMessages([]);
    setStatus("ready");
    await fetch("/api/fx", { method: "DELETE" });
  };

  return (
    <main className="h-svh bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg border bg-card font-mono text-sm font-semibold">
              fx
            </div>
            <div>
              <h1 className="text-sm font-medium">FX Chat</h1>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${configured ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                <span className="font-mono">{model}</span>
                <span aria-hidden="true">·</span>
                {configured ? "ready" : "key required"}
              </p>
            </div>
          </div>
          <Button
            aria-label="New chat"
            disabled={messages.length === 0 && !isBusy}
            onClick={() => void reset()}
            size="icon"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
          </Button>
        </header>

        <Conversation className="min-h-0">
          <ConversationContent className="mx-auto min-h-full w-full max-w-3xl px-4 py-8 sm:px-6">
            {messages.length === 0 ? (
              <ConversationEmptyState
                className="min-h-[55svh]"
                icon={<TerminalSquareIcon className="size-10" />}
                title="Ask FX about this workspace"
                description={
                  configured
                    ? "Messages stream from the embedded FX agent."
                    : "Add AI_GATEWAY_API_KEY to apps/web/.env.local, then restart the dev server."
                }
              />
            ) : (
              messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.role === "assistant" ? (
                      message.content ? (
                        <MessageResponse isAnimating={isBusy}>
                          {message.content}
                        </MessageResponse>
                      ) : (
                        <span className="animate-pulse text-muted-foreground" role="status">
                          FX is working…
                        </span>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <footer className="shrink-0 border-t bg-background/95 px-4 py-4 sm:px-6">
          <PromptInput
            className="mx-auto max-w-3xl"
            onSubmit={(message) => void sendPrompt(message)}
          >
            <PromptInputBody>
              <PromptInputTextarea
                aria-label="Message FX"
                disabled={!configured}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder={configured ? "Ask FX…" : "Configure AI_GATEWAY_API_KEY to start"}
                value={input}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="px-1 text-xs text-muted-foreground">
                  {isBusy ? "Streaming" : "Enter to send · Shift+Enter for newline"}
                </span>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={!configured || (!input.trim() && !isBusy)}
                onStop={stop}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>
        </footer>
      </div>
    </main>
  );
}
