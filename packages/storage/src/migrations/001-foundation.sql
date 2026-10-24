-- Coordinator-assigned schema 1. Future domains receive separately assigned migrations.
CREATE TABLE storage_metadata (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  schema_version INTEGER NOT NULL CHECK(schema_version >= 0),
  application_build TEXT NOT NULL,
  record_version INTEGER NOT NULL CHECK(record_version = 1)
) STRICT;
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK(version > 0),
  checksum TEXT NOT NULL CHECK(length(checksum) = 64),
  applied_at TEXT NOT NULL,
  application_build TEXT NOT NULL
) STRICT;
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision > 0),
  value TEXT NOT NULL CHECK(json_valid(value)),
  modified_at TEXT NOT NULL
) STRICT;
CREATE TABLE command_usage (
  command_id TEXT PRIMARY KEY,
  use_count INTEGER NOT NULL CHECK(use_count >= 0),
  last_used_at TEXT,
  pinned INTEGER NOT NULL CHECK(pinned IN (0, 1)),
  alias TEXT
) STRICT;
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision > 0),
  project_id TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record))
) STRICT;
CREATE TABLE message_revisions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  message_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  branch_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  parent_revision_id TEXT REFERENCES message_revisions(id),
  created_at TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record)),
  UNIQUE(message_id, branch_id, revision),
  UNIQUE(conversation_id, sequence)
) STRICT;
CREATE INDEX message_revisions_conversation ON message_revisions(conversation_id, created_at, id);
CREATE TRIGGER immutable_message_update BEFORE UPDATE ON message_revisions
BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;
-- Deletion is reserved for the future explicit conversation/history deletion policy.
