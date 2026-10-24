-- Coordinator-assigned durable decisions. Once grants remain invocation-bound memory.
CREATE TABLE permission_decisions (
  id TEXT PRIMARY KEY,
  principal_key TEXT NOT NULL CHECK(length(principal_key) = 64),
  declaration_hash TEXT NOT NULL CHECK(length(declaration_hash) = 64),
  permission_id TEXT NOT NULL,
  scope_key TEXT NOT NULL CHECK(length(scope_key) = 64),
  decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record)),
  UNIQUE(principal_key, declaration_hash, permission_id, scope_key)
) STRICT;
CREATE INDEX permission_decisions_principal ON permission_decisions(principal_key, id);
