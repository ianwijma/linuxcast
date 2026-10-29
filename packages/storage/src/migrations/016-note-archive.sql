ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1));
CREATE INDEX notes_archive_modified ON notes(archived,updated_at DESC,id DESC);
CREATE INDEX notes_archive_pinned_modified ON notes(archived,pinned,updated_at DESC,id DESC);
