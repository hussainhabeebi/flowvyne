/**
 * Plugin registry — the ONLY file you edit to install a plugin.
 *
 * To install Flowvyne:
 *   1. Add [[services]] binding to wrangler.toml  (one-time CF requirement)
 *   2. Add one line here ─────────────────────────────────────────────────┐
 *                                                                          ▼
 * To install any future plugin, repeat the same two steps.
 */

import type { PluginBinding } from "./plugin-contract";

// Adjust to match your actual Leadvyne Env type
type LeadyvneEnv = {
  FLOWVYNE: Fetcher;
  // ANOTHER_PLUGIN: Fetcher;   ← future plugins go here in wrangler.toml
};

/**
 * Returns the list of installed plugins for this request.
 * Order matters — plugins are tried in sequence for message handling;
 * the first one that returns `handled: true` wins.
 */
export function getPlugins(env: LeadyvneEnv): PluginBinding[] {
  return [
    { fetcher: env.FLOWVYNE },   // ← the one line to add per plugin
    // { fetcher: env.ANOTHER_PLUGIN },
  ];
}
