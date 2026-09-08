# Leadvyne Plugin System

Install any plugin in **2 steps**. No more editing the message handler, no more per-plugin if-statements.

---

## How it works

```
Incoming WhatsApp/Chatwoot message
        │
        ▼
Leadvyne message handler
        │
        ▼
plugin-loader  ──► GET /manifest   (discovers capabilities)
        │
        ├──► Plugin 1: POST /handle  →  handled: true  ──► return reply
        │
        ├──► Plugin 2: POST /handle  →  handled: false (no match)
        │
        └──► No plugin matched  ──►  Leadvyne's existing AI path (unchanged)
```

Every plugin Worker exposes two standard endpoints:
- `GET /manifest` — declares its id, name, and capabilities
- `POST /handle` — handles a message; returns `{ handled: true | false, ... }`

---

## Installing a plugin (2 steps)

### Step 1 — `wrangler.toml` (one-time CF requirement)

```toml
[[services]]
binding = "NEW_PLUGIN"
service  = "new-plugin-worker-name"
```

### Step 2 — `plugin-registry.ts` (one line)

```ts
export function getPlugins(env: LeadyvneEnv): PluginBinding[] {
  return [
    { fetcher: env.FLOWVYNE },
    { fetcher: env.NEW_PLUGIN },   // ← add this
  ];
}
```

That's it. The plugin's routes, settings API, and message handling all work automatically.

---

## Files to copy into Leadvyne

| File | Where in Leadvyne | Action |
|---|---|---|
| `plugin-contract.ts` | `src/plugins/plugin-contract.ts` | Copy as-is |
| `plugin-registry.ts` | `src/plugins/plugin-registry.ts` | Copy, add your plugins |
| `plugin-loader.ts` | `src/plugins/plugin-loader.ts` | Copy as-is |
| `plugin-router.ts` | `src/plugins/plugin-router.ts` | Copy as-is |
| `message-handler.ts` | Replace existing handler | Copy, keep your AI path |

Then in Leadvyne's main router, mount once:

```ts
import { pluginRouter } from "./plugins/plugin-router";
app.route("/api/plugins", pluginRouter);
```

---

## Plugin API surface (auto-proxied)

Once `pluginRouter` is mounted, every plugin's settings routes are available at:

```
/api/plugins/{pluginId}/*  →  proxied to the plugin's /api/* routes
```

For Flowvyne specifically:

| Leadvyne URL | Proxied to Flowvyne |
|---|---|
| `GET /api/plugins/flowvyne/flows` | `GET /api/flows` |
| `POST /api/plugins/flowvyne/flows` | `POST /api/flows` |
| `GET /api/plugins/flowvyne/templates` | `GET /api/templates` |

No extra route files needed in Leadvyne.

---

## Building a future plugin

Any Cloudflare Worker can be a plugin. Minimum implementation:

```ts
// GET /manifest
app.get("/manifest", (c) => c.json({
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  capabilities: ["message_handler"],
}));

// POST /handle
app.post("/handle", async (c) => {
  const { message_text } = await c.req.json();
  if (!message_text.startsWith("!")) {
    return c.json({ handled: false, next_node: null, variables: {} });
  }
  return c.json({
    handled: true,
    reply_text: "Handled by my plugin!",
    next_node: null,
    variables: {},
  });
});
```
