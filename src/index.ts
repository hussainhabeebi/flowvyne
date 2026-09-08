import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./types";
import { flows } from "./api/flows";
import { execute } from "./api/execute";
import { templates } from "./api/templates";
import { tenants } from "./api/tenants";
import { settings } from "./api/settings";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Tenant-Id", "X-Simulate-Flow-Id"],
  })
);

// ── Standard plugin contract endpoints (called by Leadvyne's plugin loader) ──

// GET /manifest — Leadvyne reads this to discover capabilities
app.get("/manifest", (c) =>
  c.json({
    id: "flowvyne",
    name: "Flowvyne",
    version: "1.0.0",
    capabilities: ["message_handler", "settings"],
  })
);

// POST /handle — Leadvyne's plugin loader calls this for every incoming message
app.route("/handle", execute);

// ── REST API (called by the builder UI + proxied by Leadvyne's plugin router) ──
app.route("/api/flows", flows);
app.route("/api/templates", templates);
app.route("/api/tenants", tenants);
app.route("/api/settings", settings);

// ── Legacy direct execute path (keep for backward compatibility) ──────────────
app.route("/execute", execute);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/healthz", (c) => c.json({ ok: true, ts: Date.now() }));

app.get("*", (c) => c.text("Flowvyne — not found", 404));

export default app;
