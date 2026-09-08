import { Hono } from "hono";
import type { Env } from "../types";

const settings = new Hono<{ Bindings: Env }>();

// GET /api/settings — load this tenant's AI context
settings.get("/", async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT system_context, updated_at FROM tenant_settings WHERE tenant_id = ?"
  ).bind(tenantId).first<{ system_context: string | null; updated_at: string }>();

  return c.json({ system_context: row?.system_context ?? "", updated_at: row?.updated_at ?? null });
});

// PUT /api/settings — save this tenant's AI context
settings.put("/", async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const body = await c.req.json<{ system_context?: string }>();

  await c.env.DB.prepare(`
    INSERT INTO tenant_settings (tenant_id, system_context)
    VALUES (?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      system_context = excluded.system_context,
      updated_at = datetime('now')
  `).bind(tenantId, body.system_context ?? "").run();

  return c.json({ ok: true });
});

export { settings };
