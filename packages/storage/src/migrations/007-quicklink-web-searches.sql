-- Existing literal definitions retain NULL configuration. Never persist queries.
ALTER TABLE quicklinks ADD COLUMN web_search TEXT
  CHECK(web_search IS NULL OR length(web_search) BETWEEN 1 AND 256);
