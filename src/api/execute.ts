import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, FlowJSON, ExecuteInput } from "../types";
import { executeFlow } from "../executor";
import { callAI } from "../ai-fallback";

const execute = new Hono<{ Bindings: Env }>();

const ExecuteSchema = z.object({
  tenant_id: z.string(),
  contact_id: z.string(),
  message_text: z.string(),
  current_node: z.string().nullable().default(null),
  variables: z.record(z.string()).default({}),
  recent_history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .optional(),
});

// ── POST /execute — called from Leadvyne via Service Binding ──────────────

execute.post("/", zValidator("json", ExecuteSchema), async (c) => {
  const body = c.req.valid("json");

  // 1. Resolve active flow for tenant (by current_node or keyword trigger)
  let flowJson: FlowJSON | null = null;

  if (body.current_node) {
    // Conversation in progress — look up the flow this node belongs to
    flowJson = await getFlowByNode(c.env, body.tenant_id, body.current_node);
  }

  if (!flowJson) {
    // New conversation or node not found — try keyword match
    flowJson = await getFlowByKeyword(
      c.env,
      body.tenant_id,
      body.message_text
    );
  }

  if (!flowJson) {
    // No flow matched — tell the plugin loader to fall through to the next plugin / AI
    return c.json({ handled: false, next_node: null, variables: body.variables });
  }

  // 2. Execute the flow
  const result = executeFlow(flowJson, body as ExecuteInput);

  if (result.kind === "ai_fallback") {
    // Node not found mid-flow — fall through so Leadvyne can try the next plugin or AI
    return c.json({ handled: false, next_node: null, variables: body.variables });
  }

  // Auto-advance through silent nodes (condition chains, etc.) up to 10 hops
  if (result.kind === "reply" && !result.reply_text && !result.reply_buttons) {
    const advanced = await advanceSilent(c.env, flowJson, result.next_node, body as ExecuteInput, result.variables);
    return c.json({ handled: true, ...advanced });
  }

  return c.json({ handled: true, ...result });
});

// ── POST /simulate — test-run a flow without touching any real data ───────

execute.post("/simulate", zValidator("json", ExecuteSchema), async (c) => {
  const body = c.req.valid("json");
  const flowIdHeader = c.req.header("X-Simulate-Flow-Id");

  if (!flowIdHeader) {
    return c.json({ error: "X-Simulate-Flow-Id header required" }, 400);
  }

  const flowJson = await getFlowById(c.env, body.tenant_id, flowIdHeader);
  if (!flowJson) return c.json({ error: "flow not found" }, 404);

  const result = executeFlow(flowJson, body as ExecuteInput);
  return c.json(result);
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function getFlowByNode(
  env: Env,
  tenantId: string,
  nodeId: string
): Promise<FlowJSON | null> {
  // Find the flow version that contains this node id
  const row = await env.DB.prepare(`
    SELECT fv.flow_json
    FROM flow_versions fv
    JOIN flows f ON f.id = fv.flow_id
    WHERE f.tenant_id = ? AND fv.published = 1
      AND json_extract(fv.flow_json, '$.nodes') LIKE ?
    ORDER BY fv.version DESC LIMIT 1
  `)
    .bind(tenantId, `%"id":"${nodeId}"%`)
    .first<{ flow_json: string }>();

  return row ? (JSON.parse(row.flow_json) as FlowJSON) : null;
}

async function getFlowByKeyword(
  env: Env,
  tenantId: string,
  message: string
): Promise<FlowJSON | null> {
  const words = message
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 5); // only check first 5 words

  for (const word of words) {
    const row = await env.DB.prepare(`
      SELECT fv.flow_json
      FROM flow_triggers ft
      JOIN flow_versions fv ON fv.flow_id = ft.flow_id AND fv.published = 1
      JOIN flows f ON f.id = ft.flow_id
      WHERE ft.tenant_id = ? AND ft.keyword = ?
        AND f.is_active = 1
      ORDER BY fv.version DESC LIMIT 1
    `)
      .bind(tenantId, word)
      .first<{ flow_json: string }>();

    if (row) return JSON.parse(row.flow_json) as FlowJSON;
  }

  return null;
}

async function getFlowById(
  env: Env,
  tenantId: string,
  flowId: string
): Promise<FlowJSON | null> {
  const row = await env.DB.prepare(`
    SELECT fv.flow_json
    FROM flow_versions fv
    JOIN flows f ON f.id = fv.flow_id
    WHERE f.id = ? AND f.tenant_id = ? AND fv.published = 1
    ORDER BY fv.version DESC LIMIT 1
  `)
    .bind(flowId, tenantId)
    .first<{ flow_json: string }>();

  return row ? (JSON.parse(row.flow_json) as FlowJSON) : null;
}

async function advanceSilent(
  env: Env,
  flow: FlowJSON,
  nextNode: string | null,
  originalInput: ExecuteInput,
  vars: Record<string, string>,
  hops = 0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!nextNode || hops >= 10) {
    return { kind: "end", variables: vars };
  }

  const result = executeFlow(flow, {
    ...originalInput,
    current_node: nextNode,
    variables: vars,
  });

  if (result.kind === "reply" && !result.reply_text && !result.reply_buttons) {
    return advanceSilent(env, flow, result.next_node, originalInput, result.variables, hops + 1);
  }

  return result;
}

function buildFreePrompt(input: ExecuteInput): string {
  return `You are a helpful assistant.\nUser: ${input.message_text}`;
}

export { execute };
