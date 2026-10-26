-- Root-launcher preference only. Recovery commands cannot acquire hidden rows.
CREATE TABLE command_visibility (
  command_id TEXT PRIMARY KEY CHECK (
    length(command_id) BETWEEN 1 AND 200 AND
    command_id NOT IN ('linuxcast:hide', 'linuxcast:quit')
  )
) STRICT;
