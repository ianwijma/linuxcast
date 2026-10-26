-- Explicit saved labels, never query history or executable template input.
ALTER TABLE quicklinks ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'
  CHECK(length(tags_json)<=1024 AND json_valid(tags_json)
    AND json_type(tags_json)='array' AND json_array_length(tags_json)<=8);
