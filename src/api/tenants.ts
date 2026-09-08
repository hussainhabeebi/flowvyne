import { Hono } from "hono";
import type { Env } from "../types";

const tenants = new Hono<{ Bindings: Env }>();

// GET /api/tenants — list enabled tenants
tenants.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT tenant_id, enabled_at, note FROM flow_enabled_tenants ORDER BY enabled_at DESC"
  ).all<{ tenant_id: string; enabled_at: string; note: string | null }>();
  return c.json(rows.results);
});

// POST /api/tenants — enable a tenant
tenants.post("/", async (c) => {
  const body = await c.req.json<{ tenant_id: string; note?: string }>();
  if (!body.tenant_id) return c.json({ error: "tenant_id required" }, 400);
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO flow_enabled_tenants (tenant_id, note) VALUES (?, ?)"
  ).bind(body.tenant_id, body.note ?? null).run();
  return c.json({ ok: true, tenant_id: body.tenant_id });
});

// DELETE /api/tenants/:id — disable a tenant
tenants.delete("/:id", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM flow_enabled_tenants WHERE tenant_id = ?"
  ).bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

export { tenants };
