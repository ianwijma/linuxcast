-- U1-01: durable source notes and drafts. Search projections are derived values.
CREATE TABLE notes (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0),
 document_version INTEGER NOT NULL CHECK(document_version=1),
 draft TEXT NOT NULL CHECK(json_valid(draft)), saved TEXT CHECK(saved IS NULL OR json_valid(saved)),
 title TEXT NOT NULL, title_key TEXT NOT NULL, text_key TEXT NOT NULL, excerpt TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX notes_modified ON notes(updated_at DESC,id DESC);
CREATE TABLE note_saved_revisions (
 note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 minute INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 content TEXT NOT NULL CHECK(json_valid(content)), created_at TEXT NOT NULL,
 PRIMARY KEY(note_id,minute)
) STRICT;
