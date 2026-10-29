ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1));
CREATE INDEX notes_pinned_modified ON notes(pinned,updated_at DESC,id DESC);
