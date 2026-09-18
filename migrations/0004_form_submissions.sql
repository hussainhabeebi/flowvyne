CREATE TABLE IF NOT EXISTS form_submissions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  contact_id      TEXT NOT NULL,
  form_node_id    TEXT NOT NULL,
  form_title      TEXT NOT NULL,
  submission_json TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'not_configured',
  sync_error      TEXT,
  synced_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant_created
  ON form_submissions(tenant_id, created_at DESC);
