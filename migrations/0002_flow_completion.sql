-- Track which contacts have completed which flows (enables return-customer experience)
CREATE TABLE IF NOT EXISTS flow_contact_completions (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  contact_id   TEXT NOT NULL,
  flow_id      TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  variables    TEXT,  -- JSON snapshot of collected variables (internal __fv_* keys excluded)
  UNIQUE(tenant_id, contact_id, flow_id)
);

CREATE INDEX IF NOT EXISTS idx_fcc_lookup
  ON flow_contact_completions(tenant_id, contact_id);
