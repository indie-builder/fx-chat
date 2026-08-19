"use client";

import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { FxTurnDetails } from "@/lib/fx-turn-state";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

const formatDuration = (durationMs: number): string =>
  durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

export function FxTurnActivity({
  details,
  hasResponse,
}: {
  details: FxTurnDetails;
  hasResponse: boolean;
}) {
  const isWaiting =
    details.phase === "starting" ||
    (details.phase === "streaming" &&
      !details.reasoning &&
      details.tools.length === 0 &&
      !hasResponse);

  return (
    <div className="flex w-full flex-col gap-2">
      {details.reasoning ? (
        <Reasoning
          className="mb-0"
          isStreaming={details.reasoningStreaming}
        >
          <ReasoningTrigger />
          <ReasoningContent>{details.reasoning}</ReasoningContent>
        </Reasoning>
      ) : null}

      {isWaiting ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 py-1 text-sm text-muted-foreground"
          role="status"
        >
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking...</Shimmer>
        </div>
      ) : null}

      {details.tools.map((tool) => (
        <Tool
          className="mb-0"
          defaultOpen={tool.state !== "output-available"}
          key={tool.id}
        >
          <ToolHeader
            state={tool.state}
            toolName={tool.name}
            type="dynamic-tool"
          />
          <ToolContent>
            {tool.input !== undefined || tool.inputText ? (
              <ToolInput input={tool.input ?? tool.inputText} />
            ) : null}
            <ToolOutput errorText={tool.errorText} output={tool.output} />
          </ToolContent>
        </Tool>
      ))}
    </div>
  );
}

export function FxTurnFooter({ details }: { details: FxTurnDetails }) {
  if (details.phase !== "complete" && details.phase !== "error") return null;

  return (
    <Collapsible className="group mt-3 w-full">
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {details.model ? <span>{details.model}</span> : null}
        {details.durationMs !== undefined ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(details.durationMs)}</span>
          </>
        ) : null}
        {details.tools.length > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {details.tools.length} tool{details.tools.length === 1 ? "" : "s"}
            </span>
          </>
        ) : null}
        {details.usage ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{details.usage.total.toLocaleString()} tokens</span>
          </>
        ) : null}
        {details.stopReason && details.stopReason !== "end_turn" ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{details.stopReason}</span>
          </>
        ) : null}
        {details.activities.length > 0 || details.usage ? (
          <CollapsibleTrigger asChild>
            <Button className="-ml-2" size="xs" variant="ghost">
              Run details
              <ChevronDownIcon
                className="transition-transform group-data-[state=open]:rotate-180"
                data-icon="inline-end"
              />
            </Button>
          </CollapsibleTrigger>
        ) : null}
      </div>

      <CollapsibleContent className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
        {details.usage ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="flex justify-between gap-3">
              <dt>Input</dt>
              <dd>{details.usage.input.total.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Cache read</dt>
              <dd>{details.usage.input.cacheRead.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Cache write</dt>
              <dd>{details.usage.input.cacheWrite.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Output</dt>
              <dd>{details.usage.output.total.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Thinking</dt>
              <dd>{details.usage.output.reasoning.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3 font-medium text-foreground">
              <dt>Total</dt>
              <dd>{details.usage.total.toLocaleString()}</dd>
            </div>
          </dl>
        ) : null}

        {details.activities.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-1.5 border-t pt-3 font-mono text-xs text-muted-foreground">
            {details.activities.map((event, index) => (
              <li
                className="grid grid-cols-[4.75rem_1fr] gap-3"
                key={`${event.timestamp}-${index}`}
              >
                <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                <span className="min-w-0 break-words">
                  {event.name}
                  {event.detail ? ` · ${event.detail}` : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
