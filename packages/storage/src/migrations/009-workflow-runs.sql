-- Metadata only. Values, labels, credentials and permission grants are excluded.
CREATE TABLE workflow_runs (
  run_id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record))
) STRICT;
CREATE INDEX workflow_runs_created ON workflow_runs(created_at,run_id);
CREATE TABLE workflow_steps (
  activation_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  state TEXT NOT NULL, created_at TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record))
) STRICT;
CREATE INDEX workflow_steps_run ON workflow_steps(run_id,created_at,activation_id);
