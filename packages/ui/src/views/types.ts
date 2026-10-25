import type { ActionModel, ViewModel, FileReference } from '@linuxcast/contracts';
export type Asset = Extract<ViewModel, { kind: 'image' }>['source'];
export type Field = Extract<ViewModel, { kind: 'form' }>['fields'][number];
export type Reference = FileReference | Extract<Field, { kind: 'application' }>['value'];
export type DraftValue = string | number | boolean | Reference;
export interface ActionIntent { viewId: string; revision: number; actionId: string; itemId?: string; values?: Record<string, DraftValue | { secretHandle: string }> }
/** These callbacks are trusted application adapters, never supplied by a ViewModel.
 * Returning from an intent callback is not evidence an external operation succeeded. */
export interface ViewHost {
  action(intent: ActionIntent): void;
  queryChanged?(viewId: string, query: string, queryRevision: number): void;
  selectionChanged?(viewId: string, itemId: string): void;
  loadMore?(viewId: string, cursor: string): void;
  openLink?(url: string): void;
  resolveImage?(asset: Asset): string | null;
  pickReference?(kind: 'file' | 'directory' | 'application', signal: AbortSignal): Promise<Reference>;
  sealSecret?(value: string, signal: AbortSignal): Promise<{ secretHandle: string }>;
  releaseSecret?(secretHandle: string): void;
}
export function availableActions(view: ViewModel, itemId: string | null): ActionModel[] {
  const item = view.kind === 'list' || view.kind === 'grid' ? view.sections.flatMap(section => section.items).find(value => value.id === itemId) : undefined;
  if (item?.disabledReason) return [];
  const itemActions = item?.actions ?? [];
  return [...itemActions, ...(view.actions ?? []).filter(action => !itemActions.some(value => value.id === action.id))];
}
