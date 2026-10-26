-- One explicit path-component configuration; never persist invocation values.
ALTER TABLE quicklinks ADD COLUMN path_argument TEXT
  CHECK(path_argument IS NULL OR (length(path_argument) BETWEEN 1 AND 256 AND web_search IS NULL));
