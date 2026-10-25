-- Opaque ownership references only. Plaintext and encrypted secret blobs never enter SQLite.
CREATE TABLE secret_references (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('provider','account','browser-pairing','backup')),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
