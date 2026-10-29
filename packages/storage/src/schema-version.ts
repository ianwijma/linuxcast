/** Ordered, reviewed assets. Wire version 1 is independent from the database schema. */
export const STORAGE_MIGRATION_ASSETS = ['001-foundation.sql', '002-permissions.sql', '003-file-index.sql', '004-secret-references.sql', '005-command-visibility.sql', '006-quicklinks.sql', '007-quicklink-web-searches.sql', '008-workflow-editor.sql', '009-workflow-runs.sql', '010-quicklink-tags.sql', '011-quicklink-presentation.sql', '012-quicklink-path-argument.sql', '013-currency-rate-cache.sql', '014-notes.sql'] as const;
export const STORAGE_SCHEMA_VERSION = STORAGE_MIGRATION_ASSETS.length;
