ALTER TABLE notes ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0 CHECK(trashed IN (0,1));
CREATE INDEX notes_trash_modified ON notes(trashed,updated_at DESC,id DESC);
CREATE INDEX notes_trash_archive_modified ON notes(trashed,archived,updated_at DESC,id DESC);
