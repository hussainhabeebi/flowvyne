import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, FlowJSON, FlowNode, ExecuteInput, ExecuteOutput } from "../types";
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

    // 0b. Load tenant's AI context
    const tenantSettings = await c.env.DB.prepare(
      "SELECT system_context FROM tenant_settings WHERE tenant_id = ?"
    ).bind(body.tenant_id).first<{ system_context: string | null }>();

    input = { ...input, system_context: tenantSettings?.system_context ?? undefined };

    // ── Return-customer state: user was shown "start again / ask a question" ──
    const returnState = body.variables.__fv_return_state;
    if (returnState === "prompted") {
      const choice = body.message_text.trim().toLowerCase();
      const wantsRestart =
        choice === "1" ||
        /\b(start|again|restart|yes|sure|ok|okay)\b/.test(choice);

      if (wantsRestart) {
        const flowId = body.variables.__fv_return_flow_id;
        const flowResult = flowId
          ? await getFlowByIdWithId(c.env, body.tenant_id, flowId)
          : await getDefaultFlowWithId(c.env, body.tenant_id);

        if (flowResult) {
          const freshVars = { __fv_flow_id: flowResult.flow_id };
          const result = executeFlow(flowResult.flow, {
            ...input,
            current_node: null,
            variables: freshVars,
          });
          return c.json({ handled: true, ...result });
        }
      }

      // They want to ask a question — hand off to Leadvyne, clear flow state
      return c.json({ handled: false, next_node: null, variables: {} });
    }

    const isReset = RESET_KEYWORDS.has(body.message_text.trim().toLowerCase());

    console.log(`[fv] tenant=${body.tenant_id} msg="${body.message_text}" current_node=${body.current_node} isReset=${isReset}`);

    // 1. Resolve active flow (with flow_id for completion tracking)
    let flowResult: FlowResult = null;

    if (isReset) {
      // On greeting/reset: check if this contact has previously completed a flow
      const prevCompletion = await getLatestCompletion(c.env, body.tenant_id, body.contact_id);
      if (prevCompletion) {
        // Returning customer — offer to restart or ask a question
        const returnVars: Record<string, string> = {
          __fv_return_state: "prompted",
          __fv_return_flow_id: prevCompletion.flow_id,
        };
        return c.json({
          handled: true,
          kind: "reply",
          reply_text:
            "Welcome back! 👋 You've previously completed our guided flow.\n\n" +
            "What would you like to do?\n" +
            "1. Start the flow again\n" +
            "2. Ask a question",
          reply_buttons: [
            { label: "Start again", value: "1", next: "" },
            { label: "Ask a question", value: "2", next: "" },
          ],
          next_node: null,
          variables: returnVars,
        });
      }

      // No prior completion — start the default flow
      flowResult = await getDefaultFlowWithId(c.env, body.tenant_id);
      console.log(`[fv] reset → default flow: ${flowResult ? "YES" : "no"}`);
    } else if (body.current_node) {
      // Conversation in progress — look up the flow this node belongs to
      flowResult = await getFlowByNodeWithId(c.env, body.tenant_id, body.current_node);
      console.log(`[fv] node match: ${flowResult ? "YES" : "no"}`);

      if (!flowResult) {
        flowResult = await getFlowByKeywordWithId(c.env, body.tenant_id, body.message_text);
        console.log(`[fv] mid-flow keyword escape: ${flowResult ? "YES" : "no"}`);
      }
    } else {
      // No active flow — classify intent
      const intent = await detectIntent(c.env, input.message_text);
      console.log(`[fv] no active flow → intent=${intent}`);

      if (intent === "product_query") {
        return c.json({ handled: false, next_node: null, variables: input.variables });
      }

      if (intent === "flow") {
        flowResult = await getFlowByKeywordWithId(c.env, body.tenant_id, body.message_text);
        console.log(`[fv] keyword match: ${flowResult ? "YES" : "no"}`);
      }

      if (!flowResult) {
        return c.json(await aiOrFallback(c.env, input, null));
      }
    }

    if (!flowResult) {
      return c.json(await aiOrFallback(c.env, input, null));
    }

    // 2. Inject flow_id into variables (persisted through conversation for completion tracking)
    const trackedVars = input.variables.__fv_flow_id
      ? input.variables
      : { ...input.variables, __fv_flow_id: flowResult.flow_id };

    // 3. Execute the flow
    const execInput = isReset
      ? { ...input, current_node: null, variables: { __fv_flow_id: flowResult.flow_id } }
      : { ...input, variables: trackedVars };

    const result = executeFlow(flowResult.flow, execInput);
    console.log(`[fv] flow result: kind=${result.kind} next_node=${result.kind === "end" || result.kind === "ai_fallback" ? "n/a" : (result as { next_node?: string | null }).next_node ?? "null"}`);

    if (result.kind === "reply" && result.form_submission) {
      await saveAndSyncForm(c.env, input, result.form_submission);
    }

    // Stuck-menu detection
    if (
      !isReset &&
      result.kind === "reply" &&
      body.current_node !== null &&
      (result as { next_node?: string | null }).next_node === body.current_node
    ) {
      const stuckNode = flowResult.flow.nodes.find((n: FlowNode) => n.id === body.current_node);
      if (stuckNode?.type === "menu" && !stuckNode.data.deterministic) {
        const intent = await detectIntent(c.env, input.message_text);
        console.log(`[fv] stuck menu → intent=${intent}`);
        if (intent !== "flow") {
          const menuContext = "The customer is viewing a menu. Answer their question, then remind them to select an option.";
          return c.json(await aiOrFallback(c.env, input, body.current_node, menuContext));
        }
      }
    }

    if (result.kind === "end") {
      // Save completion so we can offer the return-customer menu next time
      const flowId = trackedVars.__fv_flow_id ?? flowResult.flow_id;
      await saveFlowCompletion(c.env, body.tenant_id, body.contact_id, flowId, trackedVars);

      // Clear flow state — Leadvyne takes over for any follow-up questions
      return c.json({ handled: false, next_node: null, variables: {} });
    }

    if (result.kind === "ai_fallback") {
      // Mid-flow side question — find the current node's prompt for context
      const currentNode = body.current_node
        ? flowResult.flow.nodes.find((n: FlowNode) => n.id === body.current_node)
        : undefined;

      let nodeContext: string | undefined;
      if (currentNode?.type === "capture") {
        const prompt = currentNode.data.mode === "structured"
          ? currentNode.data.fields.map((f) => f.label).join(", ")
          : currentNode.data.prompt;
        nodeContext = `The customer is being asked to provide: "${prompt}". Answer their question concisely, then remind them to complete this step. Do NOT re-ask the same question — the flow handles that.`;
      } else if (currentNode?.type === "menu") {
        nodeContext = "The customer is viewing a choice menu. Answer their question briefly, then guide them back to select an option.";
      }

      const intent = await detectIntent(c.env, input.message_text);
      if (intent === "product_query" && !input.system_context) {
        // Truly out-of-scope for Flowvyne — let Leadvyne handle; preserve node position
        return c.json({ handled: false, next_node: body.current_node, variables: trackedVars });
      }

      return c.json(await aiOrFallback(
        c.env,
        { ...input, variables: trackedVars },
        isReset ? null : body.current_node,
        nodeContext
      ));
    }

    // Auto-advance through silent nodes
    if (result.kind === "reply" && !result.reply_text && !result.reply_buttons) {
      const advanced = await advanceSilent(
        c.env,
        flowResult.flow,
        result.next_node,
        execInput,
        result.variables
      );
      return c.json({ handled: true, ...advanced });
    }

    return c.json({ handled: true, ...result });

  } catch (err) {
    console.error("[flowvyne] execute error:", err);
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

// ── Flow lookup helpers (return flow_id alongside flow JSON) ──────────────

type FlowResult = { flow: FlowJSON; flow_id: string } | null;

async function getFlowByNodeWithId(
  env: Env,
  tenantId: string,
  nodeId: string
): Promise<FlowResult> {
  const row = await env.DB.prepare(`
    SELECT fv.flow_json, f.id as flow_id
    FROM flow_versions fv
    JOIN flows f ON f.id = fv.flow_id
    WHERE f.tenant_id = ? AND fv.published = 1
      AND json_extract(fv.flow_json, '$.nodes') LIKE ?
    ORDER BY fv.version DESC LIMIT 1
  `)
    .bind(tenantId, `%"id":"${nodeId}"%`)
    .first<{ flow_json: string; flow_id: string }>();

  if (!row) return null;
  return { flow: JSON.parse(row.flow_json) as FlowJSON, flow_id: row.flow_id };
}

async function getFlowByKeywordWithId(
  env: Env,
  tenantId: string,
  message: string
): Promise<FlowResult> {
  const words = message
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 5);

  for (const word of words) {
    const row = await env.DB.prepare(`
      SELECT fv.flow_json, f.id as flow_id
      FROM flow_triggers ft
      JOIN flow_versions fv ON fv.flow_id = ft.flow_id AND fv.published = 1
      JOIN flows f ON f.id = ft.flow_id
      WHERE ft.tenant_id = ? AND ft.keyword = ?
        AND f.is_active = 1
      ORDER BY fv.version DESC LIMIT 1
    `)
      .bind(tenantId, word)
      .first<{ flow_json: string; flow_id: string }>();

    if (row) return { flow: JSON.parse(row.flow_json) as FlowJSON, flow_id: row.flow_id };
  }

  return null;
}

async function getDefaultFlowWithId(
  env: Env,
  tenantId: string
): Promise<FlowResult> {
  const row = await env.DB.prepare(`
    SELECT fv.flow_json, f.id as flow_id
    FROM flow_versions fv
    JOIN flows f ON f.id = fv.flow_id
    WHERE f.tenant_id = ? AND f.is_active = 1 AND fv.published = 1
    ORDER BY f.updated_at DESC, fv.version DESC LIMIT 1
  `)
    .bind(tenantId)
    .first<{ flow_json: string; flow_id: string }>();

  if (!row) return null;
  return { flow: JSON.parse(row.flow_json) as FlowJSON, flow_id: row.flow_id };
}

async function getFlowByIdWithId(
  env: Env,
  tenantId: string,
  flowId: string
): Promise<FlowResult> {
  const row = await env.DB.prepare(`
    SELECT fv.flow_json
    FROM flow_versions fv
    JOIN flows f ON f.id = fv.flow_id
    WHERE f.id = ? AND f.tenant_id = ? AND fv.published = 1
    ORDER BY fv.version DESC LIMIT 1
  `)
    .bind(flowId, tenantId)
    .first<{ flow_json: string }>();

  if (!row) return null;
  return { flow: JSON.parse(row.flow_json) as FlowJSON, flow_id: flowId };
}

// Kept for /simulate endpoint (no need for flow_id there)
async function getFlowById(
  env: Env,
  tenantId: string,
  flowId: string
): Promise<FlowJSON | null> {
  const result = await getFlowByIdWithId(env, tenantId, flowId);
  return result?.flow ?? null;
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
    message_text: "",
  });

  if (result.kind === "reply" && !result.reply_text && !result.reply_buttons) {
    return advanceSilent(env, flow, result.next_node, originalInput, result.variables, hops + 1);
  }

  return result;
}

// ── Flow completion tracking ──────────────────────────────────────────────

async function getLatestCompletion(
  env: Env,
  tenantId: string,
  contactId: string
): Promise<{ flow_id: string } | null> {
  return env.DB.prepare(`
    SELECT flow_id FROM flow_contact_completions
    WHERE tenant_id = ? AND contact_id = ?
    ORDER BY completed_at DESC LIMIT 1
  `)
    .bind(tenantId, contactId)
    .first<{ flow_id: string }>();
}

async function saveFlowCompletion(
  env: Env,
  tenantId: string,
  contactId: string,
  flowId: string,
  variables: Record<string, string>
): Promise<void> {
  const publicVars = Object.fromEntries(
    Object.entries(variables).filter(([k]) => !k.startsWith("__fv_"))
  );
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO flow_contact_completions
        (id, tenant_id, contact_id, flow_id, completed_at, variables)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
    `)
      .bind(
        crypto.randomUUID(),
        tenantId,
        contactId,
        flowId,
        JSON.stringify(publicVars)
      )
      .run();
  } catch (err) {
    console.error("[fv] failed to save flow completion:", err);
  }
}

// ── AI-or-fallthrough helper ──────────────────────────────────────────────

async function aiOrFallback(
  env: Env,
  input: ExecuteInput,
  preserveNode: string | null,
  flowContext?: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!input.system_context) {
    // No context — let Leadvyne handle; preserve node so flow resumes after
    return {
      handled: false,
      next_node: preserveNode,
      variables: input.variables,
    };
  }

  const extraContext = flowContext
    ?? (preserveNode ? "The user is mid-flow. Answer their question, then the flow will resume." : undefined);

  const reply = await callAI(env, input, extraContext);

  return {
    handled: true,
    kind: "reply",
    reply_text: reply,
    next_node: preserveNode,
    variables: input.variables,
  };
}

export { execute };

async function saveAndSyncForm(
  env: Env,
  input: ExecuteInput,
  submission: NonNullable<Extract<ExecuteOutput, { kind: "reply" }>["form_submission"]>
): Promise<void> {
  const id = crypto.randomUUID();
  const payload = {
    submission_id: id,
    submitted_at: new Date().toISOString(),
    tenant_id: input.tenant_id,
    contact_id: input.contact_id,
    form_node_id: submission.form_node_id,
    form_title: submission.form_title,
    sheet_name: submission.sheet_sync?.sheet_name || "Flowvyne Responses",
    values: submission.values,
  };

  await env.DB.prepare(`
    INSERT INTO form_submissions
      (id, tenant_id, contact_id, form_node_id, form_title, submission_json, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.tenant_id,
    input.contact_id,
    submission.form_node_id,
    submission.form_title,
    JSON.stringify(submission.values),
    submission.sheet_sync?.enabled ? "pending" : "not_configured"
  ).run();

  const webhookUrl = submission.sheet_sync?.enabled && submission.sheet_sync.webhook_url;
  if (!webhookUrl) return;

  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:") throw new Error("Google Sheets webhook must use HTTPS");
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    await env.DB.prepare(
      "UPDATE form_submissions SET sync_status = 'synced', synced_at = datetime('now'), sync_error = NULL WHERE id = ?"
    ).bind(id).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE form_submissions SET sync_status = 'failed', sync_error = ? WHERE id = ?"
    ).bind(message.slice(0, 500), id).run();
    console.error(`[fv] Google Sheets sync failed submission=${id}:`, error);
  }
}
