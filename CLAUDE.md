# Flowvyne

Cloudflare Worker plugin for Leadvyne — visual flow builder + interpreter for WhatsApp/Chatwoot conversations.

## Architecture

```
leadvyne (existing Worker)
  └─ Service Binding ──► flowvyne (this repo)
                              ├─ Flow interpreter  (src/executor.ts)
                              ├─ AI fallback        (src/ai-fallback.ts)
                              ├─ REST API           (src/api/)
                              └─ Builder UI         (ui/)
```

## Commands

```bash
# Worker
npm install
npm run dev          # wrangler dev on :8787
npm run deploy       # build UI + deploy Worker

# D1 database
npm run db:migrate   # apply migrations/

# UI only
cd ui && npm install && npm run dev   # Vite on :5173 (proxies /api → :8787)
```

## Key files

| Path | Purpose |
|------|---------|
| `src/types.ts` | All shared TypeScript types |
| `src/executor.ts` | Pure flow interpreter — no I/O |
| `src/ai-fallback.ts` | Gemini → Workers AI fallback chain |
| `src/api/execute.ts` | Service-Binding endpoint called by Leadvyne |
| `src/api/flows.ts` | CRUD for flow definitions |
| `src/templates/index.ts` | 5 pre-built vertical templates |
| `migrations/0001_initial.sql` | D1 schema |
| `leadvyne-integration/` | Patch files to add to the Leadvyne repo |
| `ui/src/components/FlowBuilder.tsx` | React Flow canvas |
| `ui/src/store/flowStore.ts` | Zustand canvas state |
| `ui/src/utils/serialize.ts` | Canvas ↔ flow_json conversion |

## Node types

- `message` — send text, supports `{{variable}}` interpolation
- `menu` — send buttons/list; matched by label, value, or index (1/2/3)
- `capture` — await user input → store in variable; optional validation (email/phone/number)
- `form` — collect multiple typed fields, save the response, and optionally sync it to Google Sheets
- `condition` — branch on variable value; advances silently (no user-visible output)
- `end` — terminate the flow

## Flow versioning

Live conversations store a `flow_current_node` in Leadvyne's `conversations` table.
When a new version is published, in-progress conversations continue on the version they started — node ids are stable within a version.

## AI

Uses Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) — no external API key required.

## Leadvyne integration

1. Add the `[[services]]` binding in Leadvyne's `wrangler.toml`
2. Run `leadvyne-integration/schema-additions.sql` as a migration
3. Replace the existing message-handler dispatch with the snippet in `leadvyne-integration/message-handler.ts`
