/** Ordered, reviewed assets. Wire version 1 is independent from the database schema. */
export const STORAGE_MIGRATION_ASSETS = ['001-foundation.sql', '002-permissions.sql', '003-file-index.sql', '004-secret-references.sql', '005-command-visibility.sql', '006-quicklinks.sql'] as const;
export const STORAGE_SCHEMA_VERSION = STORAGE_MIGRATION_ASSETS.length;
