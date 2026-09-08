# Leadvyne ← Flowvyne integration

Four files, four steps. Nothing in Leadvyne's core changes.

---

## Step 1 — wrangler.toml

Append the contents of `wrangler-patch.toml` to Leadvyne's `wrangler.toml`.

```toml
[[services]]
binding = "FLOWVYNE"
service  = "flowvyne"
```

Both Workers must be deployed under the **same Cloudflare account**.

---

## Step 2 — Database migration

Run `schema-additions.sql` as a Leadvyne D1 migration:

```bash
wrangler d1 execute leadvyne-db --file=leadvyne-integration/schema-additions.sql
```

Adds three nullable columns — existing rows are unaffected:

| Table | Column | Purpose |
|---|---|---|
| `client_settings` | `flow_mode` (bool) | Per-tenant on/off toggle |
| `conversations` | `flow_current_node` (text) | Which node this contact is on |
| `conversations` | `flow_variables` (text, JSON) | Captured variable bag |

---

## Step 3 — Message handler

In Leadvyne's incoming-message handler, replace the top-level dispatch with the
function from `message-handler.ts`.

The only logic added is:

```
if (client.flow_mode) {
  call FLOWVYNE via Service Binding
  persist next_node + variables back to conversations row
  return reply to existing Chatwoot send layer
} else {
  existing AI path — unchanged
}
```

Chatwoot send, CRM logging, auth — all untouched.

---

## Step 4 — Settings routes

Mount `flow-settings-route.ts` inside Leadvyne's existing router:

```ts
import { flowSettingsRoutes } from "./leadvyne-integration/flow-settings-route";

app.route("/api/tenants/:tenantId/flow", flowSettingsRoutes);
```

This gives your admin UI three endpoints:

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/tenants/:id/flow/settings` | Read flow_mode + list published flows |
| `PUT` | `/api/tenants/:id/flow/settings` | Toggle flow_mode on/off |
| `DELETE` | `/api/tenants/:id/flow/contacts/:contactId` | Reset one contact's flow state |
| `DELETE` | `/api/tenants/:id/flow/contacts` | Bulk-reset all contacts (use after breaking flow changes) |

---

## What Leadvyne does NOT need to change

- Auth / Authentik SSO — Flowvyne's builder reuses the same login
- Billing — flow_mode becomes a plan feature toggled via the existing Stripe/Razorpay entitlement check
- Chatwoot / Meta / WhatsApp credentials — Leadvyne still owns the send layer
- CRM / contact database — Flowvyne never writes to it
