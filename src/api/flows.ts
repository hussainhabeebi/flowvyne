import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, FlowJSON, FlowRow, FlowVersionRow } from "../types";
import { randomId } from "../utils";

const flows = new Hono<{ Bindings: Env }>();

// ── GET /flows — list all flows for tenant ────────────────────────────────

flows.get("/", async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const rows = await c.env.DB.prepare(
    "SELECT * FROM flows WHERE tenant_id = ? ORDER BY updated_at DESC"
  )
    .bind(tenantId)
    .all<FlowRow>();

  return c.json(rows.results);
});

// ── POST /flows — create a new flow ──────────────────────────────────────

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  flow_json: z.object({
    start_node: z.string(),
    nodes: z.array(z.any()),
  }),
  trigger_keywords: z.array(z.string()).default([]),
});

flows.post("/", zValidator("json", CreateSchema), async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const body = c.req.valid("json");
  const flowId = randomId();
  const versionId = randomId();

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO flows (id, tenant_id, name, description) VALUES (?, ?, ?, ?)"
    ).bind(flowId, tenantId, body.name, body.description ?? null),

    c.env.DB.prepare(
      "INSERT INTO flow_versions (id, flow_id, version, flow_json, published) VALUES (?, ?, 1, ?, 1)"
    ).bind(versionId, flowId, JSON.stringify(body.flow_json)),

    ...body.trigger_keywords.map((kw) =>
      c.env.DB.prepare(
        "INSERT OR REPLACE INTO flow_triggers (id, flow_id, tenant_id, keyword) VALUES (?, ?, ?, ?)"
      ).bind(randomId(), flowId, tenantId, kw.toLowerCase())
    ),
  ]);

  return c.json({ id: flowId, version_id: versionId }, 201);
});

// ── GET /flows/:id — get flow with latest published version ───────────────

flows.get("/:id", async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT * FROM flows WHERE id = ? AND tenant_id = ?"
  )
    .bind(c.req.param("id"), tenantId)
    .first<FlowRow>();

  if (!row) return c.json({ error: "not found" }, 404);

  const version = await c.env.DB.prepare(
    "SELECT * FROM flow_versions WHERE flow_id = ? AND published = 1 ORDER BY version DESC LIMIT 1"
  )
    .bind(row.id)
    .first<FlowVersionRow>();

  const triggers = await c.env.DB.prepare(
    "SELECT keyword FROM flow_triggers WHERE flow_id = ?"
  )
    .bind(row.id)
    .all<{ keyword: string }>();

  return c.json({
    ...row,
    current_version: version
      ? { ...version, flow_json: JSON.parse(version.flow_json) }
      : null,
    trigger_keywords: triggers.results.map((t) => t.keyword),
  });
});

// ── PUT /flows/:id/publish — save + publish a new version ─────────────────

const PublishSchema = z.object({
  flow_json: z.object({
    start_node: z.string(),
    nodes: z.array(z.any()),
  }),
  trigger_keywords: z.array(z.string()).optional(),
});

flows.put("/:id/publish", zValidator("json", PublishSchema), async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const flowId = c.req.param("id");
  const body = c.req.valid("json");

  const flow = await c.env.DB.prepare(
    "SELECT id FROM flows WHERE id = ? AND tenant_id = ?"
  )
    .bind(flowId, tenantId)
    .first<{ id: string }>();

  if (!flow) return c.json({ error: "not found" }, 404);

  const latest = await c.env.DB.prepare(
    "SELECT MAX(version) as v FROM flow_versions WHERE flow_id = ?"
  )
    .bind(flowId)
    .first<{ v: number }>();

  const nextVersion = (latest?.v ?? 0) + 1;
  const versionId = randomId();

  const ops = [
    c.env.DB.prepare(
      "INSERT INTO flow_versions (id, flow_id, version, flow_json, published) VALUES (?, ?, ?, ?, 1)"
    ).bind(versionId, flowId, nextVersion, JSON.stringify(body.flow_json)),

    c.env.DB.prepare(
      "UPDATE flows SET is_active = 1, updated_at = datetime('now') WHERE id = ?"
    ).bind(flowId),
  ];

  if (body.trigger_keywords) {
    ops.push(
      c.env.DB.prepare("DELETE FROM flow_triggers WHERE flow_id = ?").bind(flowId),
      ...body.trigger_keywords.map((kw) =>
        c.env.DB.prepare(
          "INSERT INTO flow_triggers (id, flow_id, tenant_id, keyword) VALUES (?, ?, ?, ?)"
        ).bind(randomId(), flowId, tenantId, kw.toLowerCase())
      )
    );
  }

  await c.env.DB.batch(ops);

  return c.json({ version: nextVersion, version_id: versionId });
});

// ── DELETE /flows/:id ─────────────────────────────────────────────────────

flows.delete("/:id", async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const result = await c.env.DB.prepare(
    "DELETE FROM flows WHERE id = ? AND tenant_id = ?"
  )
    .bind(c.req.param("id"), tenantId)
    .run();

  if (!result.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// ── GET /flows/:id/versions — version history ─────────────────────────────

flows.get("/:id/versions", async (c) => {
  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) return c.json({ error: "missing X-Tenant-Id" }, 400);

  const flow = await c.env.DB.prepare(
    "SELECT id FROM flows WHERE id = ? AND tenant_id = ?"
  )
    .bind(c.req.param("id"), tenantId)
    .first<{ id: string }>();

  if (!flow) return c.json({ error: "not found" }, 404);

  const versions = await c.env.DB.prepare(
    "SELECT id, flow_id, version, published, created_at FROM flow_versions WHERE flow_id = ? ORDER BY version DESC"
  )
    .bind(flow.id)
    .all<Omit<FlowVersionRow, "flow_json">>();

  return c.json(versions.results);
});

export { flows };
