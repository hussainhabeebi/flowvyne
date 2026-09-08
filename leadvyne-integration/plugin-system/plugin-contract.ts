/**
 * Plugin contract — every Flowvyne-compatible plugin Worker must implement
 * these two endpoints. Leadvyne calls them via Service Binding.
 *
 *   GET  /manifest  → PluginManifest
 *   POST /handle    → PluginHandleOutput
 *
 * Nothing else is required. Settings / admin routes are optional extras
 * proxied automatically by the plugin router.
 */

// ── Manifest (GET /manifest) ──────────────────────────────────────────────

export type PluginCapability =
  | "message_handler" // plugin can handle incoming WhatsApp/Chatwoot messages
  | "settings";       // plugin exposes /settings routes Leadvyne should proxy

export type PluginManifest = {
  id: string;           // unique slug, e.g. "flowvyne"
  name: string;         // display name, e.g. "Flowvyne"
  version: string;      // semver, e.g. "1.0.0"
  capabilities: PluginCapability[];
};

// ── Message handle (POST /handle) ────────────────────────────────────────

export type PluginHandleInput = {
  tenant_id: string;
  contact_id: string;
  conversation_id: string;
  message_text: string;
  current_node: string | null;
  variables: Record<string, string>;
  recent_history?: Array<{ role: "user" | "assistant"; text: string }>;
};

export type PluginHandleOutput = {
  handled: boolean;             // false = plugin didn't match, try next plugin / AI
  reply_text?: string;
  reply_buttons?: Array<{ label: string; value: string }>;
  next_node: string | null;
  variables: Record<string, string>;
};

// ── Plugin binding (what Leadvyne holds in env) ───────────────────────────

export type PluginBinding = {
  fetcher: Fetcher;             // the Service Binding (env.FLOWVYNE, etc.)
  manifest?: PluginManifest;    // cached after first load
};
