/**
 * Leadvyne message handler — plugin-aware version.
 *
 * Replaces leadvyne-integration/message-handler.ts.
 * Adding a new plugin no longer requires touching this file.
 */

import { getPlugins } from "./plugin-registry";
import { dispatchToPlugins } from "./plugin-loader";

type Env = { DB: D1Database; FLOWVYNE: Fetcher };

type IncomingMessage = {
  tenant_id: string;
  contact_id: string;
  conversation_id: string;
  message_text: string;
};

export async function handleIncomingMessage(
  msg: IncomingMessage,
  env: Env
): Promise<{ reply_text?: string; reply_buttons?: Array<{ label: string; value: string }> }> {

  // Load conversation state (node position + captured variables)
  const conv = await env.DB.prepare(
    "SELECT flow_current_node, flow_variables FROM conversations WHERE id = ?"
  )
    .bind(msg.conversation_id)
    .first<{ flow_current_node: string | null; flow_variables: string | null }>();

  // Dispatch through all registered plugins
  const result = await dispatchToPlugins(getPlugins(env), {
    tenant_id: msg.tenant_id,
    contact_id: msg.contact_id,
    conversation_id: msg.conversation_id,
    message_text: msg.message_text,
    current_node: conv?.flow_current_node ?? null,
    variables: conv?.flow_variables ? JSON.parse(conv.flow_variables) : {},
  });

  if (result) {
    // A plugin handled it — persist updated state
    await env.DB.prepare(
      "UPDATE conversations SET flow_current_node = ?, flow_variables = ? WHERE id = ?"
    )
      .bind(result.next_node, JSON.stringify(result.variables), msg.conversation_id)
      .run();

    return { reply_text: result.reply_text, reply_buttons: result.reply_buttons };
  }

  // No plugin matched — use Leadvyne's existing AI path (unchanged)
  return existingAIPath(msg, env);
}

async function existingAIPath(
  _msg: IncomingMessage,
  _env: Env
): Promise<{ reply_text: string }> {
  // Your existing Leadvyne AI call goes here — completely unchanged
  throw new Error("Replace with Leadvyne's existing AI path");
}
