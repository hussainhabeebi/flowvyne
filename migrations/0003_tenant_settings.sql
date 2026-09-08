-- Per-tenant AI configuration managed inside Flowvyne's own UI
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id      TEXT PRIMARY KEY,
  system_context TEXT,   -- business description, products, pricing, hours, etc.
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
