-- One local authoring draft. No enabled workflows, grants, run inputs or history.
CREATE TABLE workflow_editor (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  revision INTEGER NOT NULL CHECK(revision>0 AND revision<9007199254740991),
  draft TEXT NOT NULL CHECK(length(draft)<=1044480),
  saved TEXT CHECK(saved IS NULL OR length(saved)<=1044480),
  updated_at TEXT NOT NULL
) STRICT;
