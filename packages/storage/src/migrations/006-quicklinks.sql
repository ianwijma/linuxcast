-- Explicit user definitions only. Browser invocations/arguments are not stored.
CREATE TABLE quicklinks (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  revision INTEGER NOT NULL CHECK(revision>0),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 128),
  name_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL CHECK(length(url) BETWEEN 1 AND 8192),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
