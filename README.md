# FX Chat

A minimal pnpm Turborepo that embeds the experimental FX agent behind a
Next.js chat page.

## Run locally

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Add AI_GATEWAY_API_KEY to apps/web/.env.local
pnpm dev
```

Open <http://localhost:3000>.

## Structure

- `apps/web` — Next.js App Router, Tailwind CSS, shadcn/ui, and AI Elements.
- `apps/web/src/app/api/fx/route.ts` — streams `libfx` assistant text.
- `apps/web/src/lib/fx.ts` — owns the process-local FX agent and session.

## Model

The default model is `moonshotai/kimi-k2.7-code`, the Vercel AI Gateway Kimi
coding model. Override it with `FX_MODEL`.

This differs from Pi's `kimi-coding/kimi-for-coding` configuration: `libfx`
talks to Vercel AI Gateway, so it requires `AI_GATEWAY_API_KEY`; a Pi
`KIMI_API_KEY` cannot be used in its place.

The demo deliberately uses one process-local session and denies permission
requests. Add per-user persistence and an approval flow before using it as a
multi-user or production application.
