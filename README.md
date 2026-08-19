# FX Chat

A minimal pnpm Turborepo that embeds the experimental FX agent behind a
Next.js chat page.

## Run locally

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Add KIMI_API_KEY to apps/web/.env.local
pnpm dev
```

Open <http://localhost:3000>.

## Structure

- `apps/web` — Next.js App Router, Tailwind CSS, shadcn/ui, and AI Elements.
- `apps/web/src/app/api/fx/route.ts` — streams normalized FX ACP updates as NDJSON.
- `apps/web/src/lib/fx.ts` — owns the process-local FX agent and session.

The server creates one `libfx@0.0.3` agent and session, then uses a custom host
`fetch` adapter to translate FX's Language Model v3 request into Kimi Coding's
Anthropic-compatible protocol. The API key never reaches the browser.

## Model

The provider is Pi's `kimi-coding/kimi-for-coding` configuration at
`https://api.kimi.com/coding/v1`. `FX_MODEL` remains the internal model identity
seen by the embedded FX core; the adapter sends requests to `kimi-for-coding`.

This is a project-owned third-party integration, not an officially supported FX
provider adapter. It should be regression-tested whenever `libfx` or the AI SDK
provider package changes.

## Public API limits

The published headless native core intentionally disables native tools and ACP
MCP. Its public turn stream exposes assistant text, ACP tool updates if the
runtime provides them, lifecycle events, cancellation, and stop reasons. The
custom Kimi adapter additionally observes provider reasoning and token usage and
renders those fields as third-party transport data.

For a full coding-agent integration with FX tools, permissions, skills,
sandbox, and client-provided MCP servers, the official architecture is a
backend ACP client that launches `fx acp` for each workspace. See the
[official integration research](./docs/research/fx-official-external-integration.md).

The demo deliberately uses one process-local session and denies permission
requests. Add per-user persistence and an approval flow before using it as a
multi-user or production application.
