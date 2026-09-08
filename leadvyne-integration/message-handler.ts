/**
 * Leadvyne message-handler integration patch
 *
 * Drop this into your existing Leadvyne Worker message handler.
 * The only two additions to wrangler.toml are:
 *
 *   [[services]]
 *   binding = "FLOWVYNE"
 *   service  = "flowvyne"
 *
 * Everything else (Chatwoot send, CRM log, auth) is unchanged.
 */

// ── Types (match what Leadvyne already has) ───────────────────────────────

type LeadyvneEnv = {
  FLOWVYNE: Fetcher; // Service Binding — no HTTP, same CF account
  DB: D1Database;    // Leadvyne's existing D1
  // …other existing bindings (CHATWOOT_TOKEN, etc.)
};

type IncomingMessage = {
  tenant_id: string;
  contact_id: string;
  conversation_id: string;
  message_text: string;
};

type FlowvyneResponse = {
  kind: "reply" | "end" | "ai_fallback";
  reply_text?: string;
  reply_buttons?: Array<{ label: string; value: string }>;
  next_node: string | null;
  variables: Record<string, string>;
};

// ── Main handler (replaces / wraps the existing handler body) ─────────────

export async function handleIncomingMessage(
  msg: IncomingMessage,
  env: LeadyvneEnv
): Promise<{ reply_text?: string; reply_buttons?: Array<{ label: string; value: string }> }> {

  // 1. Check if this client has flow mode enabled
  const clientSettings = await env.DB.prepare(
    "SELECT flow_mode FROM client_settings WHERE tenant_id = ?"
  )
    .bind(msg.tenant_id)
    .first<{ flow_mode: number }>();

  if (!clientSettings?.flow_mode) {
    // ── Existing AI path — UNCHANGED ──────────────────────────────────────
    return existingAIPath(msg, env);
  }

  // 2. Load current flow state for this contact
  const conv = await env.DB.prepare(
    "SELECT flow_current_node, flow_variables FROM conversations WHERE id = ?"
  )
    .bind(msg.conversation_id)
    .first<{ flow_current_node: string | null; flow_variables: string | null }>();

  const currentNode = conv?.flow_current_node ?? null;
  const variables: Record<string, string> = conv?.flow_variables
    ? JSON.parse(conv.flow_variables)
    : {};

  // 3. Call Flowvyne via Service Binding (Worker-to-Worker, no public HTTP)
  const flowResp = await env.FLOWVYNE.fetch(
    new Request("https://flowvyne/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: msg.tenant_id,
        contact_id: msg.contact_id,
        message_text: msg.message_text,
        current_node: currentNode,
        variables,
      }),
    })
  );

  if (!flowResp.ok) {
    // Flowvyne failed — fall back gracefully to the existing Leadvyne AI path
    console.error("Flowvyne error:", await flowResp.text());
    return existingAIPath(msg, env);
  }

  const result = (await flowResp.json()) as FlowvyneResponse;

  // 4. Persist updated flow state back into Leadvyne's conversation row
  await env.DB.prepare(
    "UPDATE conversations SET flow_current_node = ?, flow_variables = ? WHERE id = ?"
  )
    .bind(
      result.next_node,
      JSON.stringify(result.variables),
      msg.conversation_id
    )
    .run();

  // 5. Return reply to Leadvyne's existing send layer (Chatwoot / Meta)
  //    Leadvyne still does the actual send — nothing changes here
  return {
    reply_text: result.reply_text,
    reply_buttons: result.reply_buttons,
  };
}

// ── Stub for the existing AI path (replace with your actual implementation)

async function existingAIPath(
  _msg: IncomingMessage,
  _env: LeadyvneEnv
): Promise<{ reply_text: string }> {
  // Your existing Gemini / Workers AI call goes here — completely unchanged
  throw new Error("Replace this stub with the existing AI path from Leadvyne");
}
