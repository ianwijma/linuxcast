-- Selected-root metadata and staged generations; maintained by the sole storage owner.
CREATE TABLE file_index_roots (
 id TEXT PRIMARY KEY, config TEXT NOT NULL CHECK(json_valid(config)),
 state TEXT NOT NULL CHECK(state IN ('idle','scanning','ready','degraded','unavailable','removed')),
 generation TEXT, scan_id TEXT, progress TEXT CHECK(progress IS NULL OR json_valid(progress)),
 previous_state TEXT NOT NULL DEFAULT 'idle' CHECK(previous_state IN ('idle','ready','degraded','unavailable'))
) STRICT;
CREATE TABLE file_index_entries (
 rowid INTEGER PRIMARY KEY, root_id TEXT NOT NULL REFERENCES file_index_roots(id),
 generation TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('file','directory')), size INTEGER NOT NULL CHECK(size>=0),
 modified_ms INTEGER NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL,
 UNIQUE(root_id,generation,path)
) STRICT;
CREATE INDEX file_index_generation ON file_index_entries(root_id,generation);
CREATE VIRTUAL TABLE file_index_fts USING fts5(name,path,content='file_index_entries',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
