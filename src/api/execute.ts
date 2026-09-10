import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, FlowJSON, FlowNode, ExecuteInput } from "../types";
import { executeFlow } from "../executor";
import { callAI } from "../ai-fallback";
import { detectIntent } from "../intent";

const execute = new Hono<{ Bindings: Env }>();

// Words that restart the conversation regardless of current_node
const RESET_KEYWORDS = new Set([
  "hi", "hello", "hey", "start", "restart", "menu", "help", "begin",
]);

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

  // Minimal input — extended once tenant settings load (needed in catch scope)
  let input: ExecuteInput = {
    tenant_id: body.tenant_id,
    contact_id: body.contact_id,
    message_text: body.message_text,
    current_node: body.current_node,
    variables: body.variables,
    recent_history: body.recent_history,
  };

  try {
    // 0. Check tenant is opted in to Flowvyne
    const allowed = await c.env.DB.prepare(
      "SELECT 1 FROM flow_enabled_tenants WHERE tenant_id = ? LIMIT 1"
    ).bind(body.tenant_id).first();
    if (!allowed) {
      return c.json({ handled: false, next_node: null, variables: body.variables });
    }

    // 0b. Load tenant's AI context (set via Flowvyne's own settings UI, not from Leadvyne)
    const tenantSettings = await c.env.DB.prepare(
      "SELECT system_context FROM tenant_settings WHERE tenant_id = ?"
    ).bind(body.tenant_id).first<{ system_context: string | null }>();

    input = { ...input, system_context: tenantSettings?.system_context ?? undefined };

    // Reset keywords (hi, hello, start…) discard stale current_node and restart the flow
    const isReset = RESET_KEYWORDS.has(body.message_text.trim().toLowerCase());

    console.log(`[fv] tenant=${body.tenant_id} msg="${body.message_text}" current_node=${body.current_node} isReset=${isReset}`);

    // 1. Resolve active flow
    let flowJson: FlowJSON | null = null;

    if (isReset) {
      // Explicit greeting/restart — skip keyword matching, go straight to default/greeting flow
      flowJson = await getDefaultFlow(c.env, body.tenant_id);
      console.log(`[fv] reset → default flow: ${flowJson ? "YES" : "no"}`);
    } else if (body.current_node) {
      // Conversation in progress — look up the flow this node belongs to
      flowJson = await getFlowByNode(c.env, body.tenant_id, body.current_node);
      console.log(`[fv] node match: ${flowJson ? "YES" : "no"}`);

      // If user typed a recognised keyword mid-flow, let them jump to that flow
      if (!flowJson) {
        flowJson = await getFlowByKeyword(c.env, body.tenant_id, body.message_text);
        console.log(`[fv] mid-flow keyword escape: ${flowJson ? "YES" : "no"}`);
      }
    } else {
      // No active flow — classify intent FIRST so a stray word doesn't retrigger the greeting menu
      const intent = await detectIntent(c.env, input.message_text);
      console.log(`[fv] no active flow → intent=${intent}`);

      if (intent === "product_query") {
        return c.json({ handled: false, next_node: null, variables: input.variables });
      }

      if (intent === "flow") {
        // User wants to start a process — check for a matching keyword trigger
        flowJson = await getFlowByKeyword(c.env, body.tenant_id, body.message_text);
        console.log(`[fv] keyword match: ${flowJson ? "YES" : "no"}`);
      }

      // "general" intent or no keyword match → answer via AI
      if (!flowJson) {
        return c.json(await aiOrFallback(c.env, input, null));
      }
    }

    // 2. Execute the flow (reset means start from beginning, not current_node)
    const execInput = isReset ? { ...input, current_node: null } : input;
    const result = executeFlow(flowJson, execInput);
    console.log(`[fv] flow result: kind=${result.kind} next_node=${result.kind === "end" || result.kind === "ai_fallback" ? "n/a" : (result as {next_node?:string|null}).next_node ?? "null"}`);

    // Stuck-menu detection: the menu re-presented the exact node the user was already on —
    // meaning no option matched. If intent isn't flow-related, answer via AI and preserve
    // current_node so the flow resumes after the AI reply.
    if (
      !isReset &&
      result.kind === "reply" &&
      body.current_node !== null &&
      (result as { next_node?: string | null }).next_node === body.current_node
    ) {
      const stuckNode = flowJson.nodes.find((n: FlowNode) => n.id === body.current_node);
      if (stuckNode?.type === "menu") {
        const intent = await detectIntent(c.env, input.message_text);
        console.log(`[fv] stuck menu → intent=${intent}`);
        if (intent !== "flow") {
          return c.json(await aiOrFallback(c.env, input, body.current_node));
        }
      }
    }

    if (result.kind === "end") {
      // Flow reached its end node — user's message should be handled as fresh input
      const intent = await detectIntent(c.env, input.message_text);
      if (intent === "product_query") {
        return c.json({ handled: false, next_node: null, variables: input.variables });
      }
      return c.json(await aiOrFallback(c.env, input, null));
    }

    if (result.kind === "ai_fallback") {
      // Mid-flow question that didn't match a node.
      const intent = await detectIntent(c.env, input.message_text);

      if (intent === "product_query" && !input.system_context) {
        return c.json({
          handled: true,
          kind: "reply",
          reply_text: "I'll connect you with someone who can help with that. To continue, ",
          next_node: body.current_node,
          variables: input.variables,
        });
      }

      return c.json(await aiOrFallback(c.env, input, isReset ? null : body.current_node));
    }

    // Auto-advance through silent nodes (condition chains, etc.) up to 10 hops
    if (result.kind === "reply" && !result.reply_text && !result.reply_buttons) {
      const advanced = await advanceSilent(c.env, flowJson, result.next_node, execInput, result.variables);
      return c.json({ handled: true, ...advanced });
    }

    return c.json({ handled: true, ...result });

  } catch (err) {
    console.error("[flowvyne] execute error:", err);
    // Any unexpected error — try AI, then give up gracefully
    try {
      return c.json(await aiOrFallback(c.env, input, null));
    } catch {
      return c.json({ handled: false, next_node: null, variables: body.variables });
    }
  }
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

  const simInput: ExecuteInput = {
    tenant_id: body.tenant_id,
    contact_id: body.contact_id,
    message_text: body.message_text,
    current_node: body.current_node,
    variables: body.variables,
    recent_history: body.recent_history,
  };
  const result = executeFlow(flowJson, simInput);
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

async function getDefaultFlow(
  env: Env,
  tenantId: string
): Promise<FlowJSON | null> {
  // Returns the most-recently-updated active published flow for this tenant.
  // Used when no keyword matches — so a single greeting/main-menu flow always triggers.
  const row = await env.DB.prepare(`
    SELECT fv.flow_json
    FROM flow_versions fv
    JOIN flows f ON f.id = fv.flow_id
    WHERE f.tenant_id = ? AND f.is_active = 1 AND fv.published = 1
    ORDER BY f.updated_at DESC, fv.version DESC LIMIT 1
  `)
    .bind(tenantId)
    .first<{ flow_json: string }>();

  return row ? (JSON.parse(row.flow_json) as FlowJSON) : null;
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
    message_text: "",  // blank so capture nodes prompt rather than consuming prior user text
  });

  if (result.kind === "reply" && !result.reply_text && !result.reply_buttons) {
    return advanceSilent(env, flow, result.next_node, originalInput, result.variables, hops + 1);
  }

  return result;
}

// ── AI-or-fallthrough helper ──────────────────────────────────────────────
// If Leadvyne injected system_context, answer with Workers AI.
// Otherwise return handled:false so Leadvyne's own AI/plugin chain takes over.

async function aiOrFallback(
  env: Env,
  input: ExecuteInput,
  preserveNode: string | null  // keep current_node so flow resumes after AI answer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!input.system_context) {
    // No context provided — we can't give a useful answer; let Leadvyne handle it
    return { handled: false, next_node: null, variables: input.variables };
  }

  const reply = await callAI(env, input,
    preserveNode
      ? "The user is mid-flow. Answer their question, then the flow will resume."
      : undefined
  );

  return {
    handled: true,
    kind: "reply",
    reply_text: reply,
    next_node: preserveNode,  // null = no active flow; non-null = resume flow next turn
    variables: input.variables,
  };
}

export { execute };
