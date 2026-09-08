import { Hono } from "hono";
import type { Env } from "../types";
import { VERTICAL_TEMPLATES } from "../templates/index";

const templates = new Hono<{ Bindings: Env }>();

// GET /templates — list all pre-built vertical templates
templates.get("/", (c) => {
  return c.json(
    VERTICAL_TEMPLATES.map(({ id, name, description, vertical }) => ({
      id,
      name,
      description,
      vertical,
    }))
  );
});

// GET /templates/:id — get a specific template with its flow_json
templates.get("/:id", (c) => {
  const tpl = VERTICAL_TEMPLATES.find((t) => t.id === c.req.param("id"));
  if (!tpl) return c.json({ error: "not found" }, 404);
  return c.json(tpl);
});

export { templates };
