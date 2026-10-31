import type { DataSettingsClearCategory, DataSettingsExportCategory } from '@linuxcast/contracts';
import type { GlyphCategory, LineIconName } from '@linuxcast/ui';

/**
 * Static, first-party Local data categories. These mirror the main-owned allowlists in
 * `packages/contracts/src/data-settings.ts`; the renderer never invents a category, a per-category
 * capability or a record count. `getState` only reports appearance.
 */
export interface LocalDataCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Extra public search words. */
  readonly keywords: string;
  readonly tile: GlyphCategory;
  readonly tileIcon?: LineIconName;
  readonly navIcon: LineIconName;
  readonly exportCategory: DataSettingsExportCategory | null;
  readonly clearCategory: DataSettingsClearCategory | null;
  /** Credentials only opens the dedicated key setup window; it never reads or shows a key. */
  readonly credentials?: true;
}

export const LOCAL_DATA_CATEGORIES: readonly LocalDataCategory[] = Object.freeze([
  { id: 'credentials', title: 'Credentials', description: 'Manage the OpenRouter key, storage mode and session-only clearing. Provider and model selection are separate.',
    keywords: 'credentials openrouter key storage', tile: 'system', tileIcon: 'gear', navIcon: 'gear', exportCategory: null, clearCategory: null, credentials: true },
  { id: 'settings', title: 'Settings', description: 'Export appearance, shortcuts and collection preferences. Credentials and permission grants are excluded.',
    keywords: '', tile: 'system', navIcon: 'gear', exportCategory: 'settings', clearCategory: null },
  { id: 'command-usage', title: 'Command usage', description: 'Clear usage counts and last-used times. Your pins and aliases stay.',
    keywords: '', tile: 'command', navIcon: 'command', exportCategory: 'command-usage', clearCategory: 'command-usage' },
  { id: 'ai-conversations', title: 'AI conversations', description: 'Export conversations as unencrypted JSON, or delete conversations and their message revisions.',
    keywords: '', tile: 'ai', navIcon: 'spark', exportCategory: 'ai-conversations', clearCategory: 'ai-conversations' },
  { id: 'file-index', title: 'File index', description: 'Clear indexed metadata. Selected folders and original files stay.',
    keywords: '', tile: 'files', tileIcon: 'folder', navIcon: 'folder', exportCategory: null, clearCategory: 'file-index' },
  { id: 'application-logs', title: 'Application logs', description: 'Export or reset local event metadata. No content bodies or credentials. Kept for 14 days, up to 20 MiB. New events may appear after clearing.',
    keywords: '', tile: 'system', tileIcon: 'note', navIcon: 'note', exportCategory: 'application-logs', clearCategory: 'application-logs' },
  { id: 'tool-diagnostics', title: 'Tool diagnostics', description: 'Export or reset local tool event metadata. No tool arguments, results or credentials. Kept for 30 days, up to 100 MiB. Each category is managed separately.',
    keywords: '', tile: 'workflow', navIcon: 'workflow', exportCategory: 'tool-diagnostics', clearCategory: 'tool-diagnostics' },
] satisfies LocalDataCategory[]);

export function matchCategories(query: string, categories: readonly LocalDataCategory[] = LOCAL_DATA_CATEGORIES): LocalDataCategory[] {
  const needle = query.toLocaleLowerCase().trim();
  if (!needle) return [...categories];
  return categories.filter(category => `${category.title} ${category.description} ${category.keywords}`.toLocaleLowerCase().includes(needle));
}

export type LocalDataActionKind = 'export' | 'clear' | 'credentials';
/** The action captured when it starts; the band keeps naming it across search/navigation changes. */
export interface CapturedAction { readonly token: number; readonly kind: LocalDataActionKind; readonly categoryId: string; readonly title: string }

export const actionLabel = (action: Pick<CapturedAction, 'kind' | 'title'>) =>
  action.kind === 'credentials' ? 'Manage credentials' : `${action.kind === 'export' ? 'Export' : 'Clear'} ${action.title.toLowerCase()}`;
