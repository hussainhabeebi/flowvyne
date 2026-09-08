/**
 * Leadvyne — flow-mode settings routes
 *
 * Mount these inside Leadvyne's existing router, e.g.:
 *   app.route("/api/tenants/:tenantId/flow", flowSettingsRoutes);
 *
 * Requires the columns added by schema-additions.sql.
 * Auth is handled by Leadvyne's existing middleware — no changes needed there.
 */

import { Hono } from "hono";

// Adjust to match your existing Leadvyne Env type
type Env = { DB: D1Database; FLOWVYNE: Fetcher };

export const flowSettingsRoutes = new Hono<{ Bindings: Env }>();

// ── GET /api/tenants/:tenantId/flow/settings ───────────────────────────────
// Returns whether flow mode is on + the list of published flows from Flowvyne.

flowSettingsRoutes.get("/settings", async (c) => {
  const tenantId = c.req.param("tenantId");

  const row = await c.env.DB.prepare(
    "SELECT flow_mode FROM client_settings WHERE tenant_id = ?"
  )
    .bind(tenantId)
    .first<{ flow_mode: number }>();

  // Fetch the tenant's flows from Flowvyne (same account, Service Binding)
  const flowsResp = await c.env.FLOWVYNE.fetch(
    new Request("https://flowvyne/api/flows", {
      headers: { "X-Tenant-Id": tenantId },
    })
  );

  const flows = flowsResp.ok ? await flowsResp.json() : [];

  return c.json({
    flow_mode: Boolean(row?.flow_mode),
    flows,
  });
});

// ── PUT /api/tenants/:tenantId/flow/settings ──────────────────────────────
// Toggles flow_mode on or off for a tenant.

flowSettingsRoutes.put("/settings", async (c) => {
  const tenantId = c.req.param("tenantId");
  const { flow_mode } = await c.req.json<{ flow_mode: boolean }>();

  await c.env.DB.prepare(
    "UPDATE client_settings SET flow_mode = ? WHERE tenant_id = ?"
  )
    .bind(flow_mode ? 1 : 0, tenantId)
    .run();

  return c.json({ ok: true, flow_mode });
});

// ── DELETE /api/tenants/:tenantId/flow/contacts/:contactId ────────────────
// Resets a single contact's flow state (clears current node + variables).
// Useful when a conversation gets stuck or a client wants a fresh start.

flowSettingsRoutes.delete("/contacts/:contactId", async (c) => {
  const { tenantId, contactId } = c.req.param();

  await c.env.DB.prepare(
    `UPDATE conversations
        SET flow_current_node = NULL,
            flow_variables     = NULL
      WHERE tenant_id = ? AND contact_id = ?`
  )
    .bind(tenantId, contactId)
    .run();

  return c.json({ ok: true });
});

// ── DELETE /api/tenants/:tenantId/flow/contacts ───────────────────────────
// Bulk-resets ALL contacts for a tenant (e.g. after publishing a breaking
// flow change where you want everyone to restart from the beginning).

flowSettingsRoutes.delete("/contacts", async (c) => {
  const tenantId = c.req.param("tenantId");

  const { meta } = await c.env.DB.prepare(
    `UPDATE conversations
        SET flow_current_node = NULL,
            flow_variables     = NULL
      WHERE tenant_id = ?`
  )
    .bind(tenantId)
    .run();

  return c.json({ ok: true, reset_count: meta.changes });
});
