-- Saved public clock projection only; invocation snapshots/expanded URLs never persist.
ALTER TABLE quicklinks ADD COLUMN clock_link TEXT
  CHECK(clock_link IS NULL OR (length(clock_link) BETWEEN 1 AND 256
    AND web_search IS NULL AND path_argument IS NULL));
