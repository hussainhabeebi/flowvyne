import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./types";
import { flows } from "./api/flows";
import { execute } from "./api/execute";
import { templates } from "./api/templates";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin, // tighten in prod to specific UI origin
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Tenant-Id", "X-Simulate-Flow-Id"],
  })
);

// ── Service Binding entry point (called by Leadvyne Worker) ───────────────
// Leadvyne calls: env.FLOWVYNE.fetch(new Request("https://flowvyne/execute", { method: "POST", body: JSON.stringify(payload) }))
app.route("/execute", execute);

// ── REST API (called by the builder UI) ───────────────────────────────────
app.route("/api/flows", flows);
app.route("/api/templates", templates);

// ── Health check ──────────────────────────────────────────────────────────
app.get("/healthz", (c) => c.json({ ok: true, ts: Date.now() }));

// ── Serve builder UI (static assets via [site] bucket) ───────────────────
// Requests not matched above fall through to Workers Sites static serving
app.get("*", async (c) => {
  // In local dev wrangler handles this; in prod the [site] bucket serves index.html
  return c.text("Flowvyne — not found", 404);
});

export default app;
