-- ── Additions to Leadvyne's existing database ────────────────────────────
-- Run as a migration on the existing Leadvyne D1 / Postgres database.
-- These columns are nullable so existing rows are unaffected.

-- Per-client toggle (in whatever table stores client/tenant settings)
ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS flow_mode BOOLEAN NOT NULL DEFAULT false;

-- Conversation state — tracks where each contact is in a flow
-- Add to the existing contacts/conversations table (adjust table name to match yours)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS flow_current_node TEXT DEFAULT NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS flow_variables     TEXT DEFAULT NULL; -- stored as JSON

-- Index for fast node lookups (optional but useful at scale)
CREATE INDEX IF NOT EXISTS idx_conversations_flow_node
  ON conversations (tenant_id, flow_current_node)
  WHERE flow_current_node IS NOT NULL;
