import type { GlyphCategory } from '@linuxcast/ui';
import type { PermissionSettingsRow } from '../../../platform-contracts/src/permission-settings.ts';

/**
 * Presentation-only copy for the existing Saved permissions window. Nothing here classifies backend
 * readiness or grant success: a remembered decision is shown exactly as stored, with its source kind,
 * version and declared scope taken verbatim from the main-owned snapshot row.
 */
export const operations: Readonly<Record<PermissionSettingsRow['permissionId'], string>> = {
  'files.read': 'Read selected files', 'files.write': 'Write selected files', 'network.fetch': 'Contact an allowed website', 'network.local': 'Contact a local network service',
  'clipboard.read': 'Read the current clipboard', 'clipboard.history': 'Read selected clipboard history', 'clipboard.write': 'Replace the clipboard', 'input.paste': 'Paste into an application',
  'input.shortcut': 'Send a shortcut to an application', 'applications.launch': 'Open an application or selected file', 'windows.control': 'Control a selected window', 'ai.generate': 'Use the configured AI provider',
  'notifications.show': 'Show notifications', 'background.run': 'Run in the background', 'scripts.execute': 'Run a sandboxed script',
};

export const sourceKinds: Readonly<Record<PermissionSettingsRow['sourceKind'], string>> = { builtin: 'Linuxcast', workflow: 'Workflow', extension: 'Extension' };

/** Closed host tile vocabulary: the noun is the requesting source, typed again in text beside it. */
export const sourceTiles: Readonly<Record<PermissionSettingsRow['sourceKind'], GlyphCategory>> = { builtin: 'system', workflow: 'workflow', extension: 'command' };

export const versionText = (row: PermissionSettingsRow) => row.version ?? 'Not versioned';

/** The word always carries the classification; the glyph shape repeats it; colour never does. */
export const decisionText = (row: PermissionSettingsRow) => `Remembered: ${row.decision}`;

export const removalConsequence = (row: PermissionSettingsRow) => row.decision === 'deny'
  ? 'Removing a denial permits a new request. It does not approve or rerun anything.'
  : 'Future operations will need a new approval. Pending requests for this source will be cancelled; an action already sent cannot be undone.';

/** Complete accessible name: full bounded source label plus the plain operation. */
export const reviewName = (row: PermissionSettingsRow) => `Review removal: ${row.sourceLabel} · ${operations[row.permissionId]}`;
