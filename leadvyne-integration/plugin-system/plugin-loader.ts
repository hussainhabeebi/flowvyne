/**
 * Plugin loader — drop into Leadvyne's message handler.
 *
 * Replaces the hardcoded `if (client.flow_mode)` block with a loop that
 * tries each registered plugin in order. No more per-plugin if-statements.
 */

import type {
  PluginBinding,
  PluginManifest,
  PluginHandleInput,
  PluginHandleOutput,
} from "./plugin-contract";

// ── Manifest loader (cached on the PluginBinding object) ─────────────────

export async function loadManifest(plugin: PluginBinding): Promise<PluginManifest | null> {
  if (plugin.manifest) return plugin.manifest;

  try {
    const resp = await plugin.fetcher.fetch(
      new Request("https://plugin/manifest")
    );
    if (!resp.ok) return null;
    plugin.manifest = (await resp.json()) as PluginManifest;
    return plugin.manifest;
  } catch {
    return null;
  }
}

// ── Message handler ───────────────────────────────────────────────────────

/**
 * Try each plugin in order. Returns the first successful result.
 * Falls back to null if no plugin handles the message (Leadvyne uses its
 * existing AI path in that case).
 */
export async function dispatchToPlugins(
  plugins: PluginBinding[],
  input: PluginHandleInput
): Promise<PluginHandleOutput | null> {
  for (const plugin of plugins) {
    const manifest = await loadManifest(plugin);
    if (!manifest?.capabilities.includes("message_handler")) continue;

    try {
      const resp = await plugin.fetcher.fetch(
        new Request("https://plugin/handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
      );

      if (!resp.ok) continue;

      const result = (await resp.json()) as PluginHandleOutput;
      if (result.handled) return result;
    } catch (err) {
      console.error(`Plugin ${manifest?.id ?? "unknown"} error:`, err);
    }
  }

  return null; // no plugin handled it — use Leadvyne's existing AI path
}

// ── Settings proxy ────────────────────────────────────────────────────────

/**
 * Forward a request to a specific plugin's management API.
 * Call this from the `/api/plugins/:pluginId/*` route in Leadvyne's router.
 */
export async function proxyToPlugin(
  plugins: PluginBinding[],
  pluginId: string,
  request: Request
): Promise<Response> {
  for (const plugin of plugins) {
    const manifest = await loadManifest(plugin);
    if (manifest?.id !== pluginId) continue;
    if (!manifest.capabilities.includes("settings")) {
      return new Response("Plugin does not expose settings", { status: 404 });
    }
    return plugin.fetcher.fetch(request);
  }
  return new Response("Plugin not found", { status: 404 });
}
