/**
 * Plugin router — mount once in Leadvyne's existing Hono app.
 *
 *   app.route("/api/plugins", pluginRouter);
 *
 * That's it. All installed plugins get their settings routes automatically.
 */

import { Hono } from "hono";
import { getPlugins } from "./plugin-registry";
import { loadManifest, proxyToPlugin } from "./plugin-loader";

type Env = { FLOWVYNE: Fetcher /* add future bindings here */ };

export const pluginRouter = new Hono<{ Bindings: Env }>();

// GET /api/plugins — list all installed plugins + their manifests
pluginRouter.get("/", async (c) => {
  const plugins = getPlugins(c.env);
  const manifests = await Promise.all(plugins.map((p) => loadManifest(p)));
  return c.json(manifests.filter(Boolean));
});

// ALL /api/plugins/:pluginId/* — proxy to the plugin's own settings routes
// e.g. GET /api/plugins/flowvyne/flows  →  Flowvyne's GET /api/flows
pluginRouter.all("/:pluginId/*", async (c) => {
  const plugins = getPlugins(c.env);
  const pluginId = c.req.param("pluginId");

  // Strip the /api/plugins/:pluginId prefix so the plugin sees its own paths
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(`/api/plugins/${pluginId}`, "/api");

  const forwarded = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });

  return proxyToPlugin(plugins, pluginId, forwarded);
});
