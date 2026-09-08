-- Opt-in allowlist: only tenants listed here will have flows activated
CREATE TABLE IF NOT EXISTS flow_enabled_tenants (
  tenant_id  TEXT PRIMARY KEY,
  enabled_at TEXT NOT NULL DEFAULT (datetime('now')),
  note       TEXT  -- optional label (e.g. client name)
);
