-- Flow definitions (tenant-scoped, no customer data here)
CREATE TABLE IF NOT EXISTS flows (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Versioned flow snapshots — live conversations pin to a version_id
CREATE TABLE IF NOT EXISTS flow_versions (
  id          TEXT PRIMARY KEY,
  flow_id     TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  flow_json   TEXT NOT NULL,  -- JSON: { start_node, nodes[] }
  published   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(flow_id, version)
);

-- Keyword triggers — which keywords start which flow
CREATE TABLE IF NOT EXISTS flow_triggers (
  id        TEXT PRIMARY KEY,
  flow_id   TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  keyword   TEXT NOT NULL,        -- case-insensitive match
  UNIQUE(tenant_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_flows_tenant           ON flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_versions_flow     ON flow_versions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_triggers_tenant   ON flow_triggers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_triggers_keyword  ON flow_triggers(tenant_id, keyword);
