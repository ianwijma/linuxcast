import type { ViewModel, ActionModel } from '@linuxcast/contracts';
export const open: ActionModel = { id: 'open', title: 'Open details', kind: 'navigate', effect: 'read' };
export const copy: ActionModel = { id: 'copy', title: 'Copy reference', kind: 'copy', effect: 'write', shortcut: { key: 'c', modifiers: ['Ctrl', 'Shift'] } };
export const remove: ActionModel = { id: 'remove', title: 'Remove from library', kind: 'invoke', effect: 'destructive', shortcut: { key: 'Delete', modifiers: ['Ctrl'] } };
export const list: ViewModel = { protocolVersion: 1, viewId: 'library', revision: 1, kind: 'list', title: 'Library', search: { placeholder: 'Search local examples…', query: '', mode: 'host' }, sections: [
  { id: 'recent', title: 'Recent', items: [
    { id: 'guide', title: 'A calmer workspace', subtitle: 'Design notes · Updated today', icon: { kind: 'builtin', name: 'file' }, actions: [open, copy, remove], accessories: [{ text: 'Markdown' }] },
    { id: 'work', title: 'Weekly planning', subtitle: 'Personal collection', icon: { kind: 'builtin', name: 'folder' }, actions: [open, copy], tags: [{ text: 'Local', tone: 'neutral' }] },
    { id: 'archive', title: 'Shared archive', subtitle: 'A selected directory', icon: { kind: 'builtin', name: 'folder' }, disabledReason: 'Permission required. Choose this directory to grant access.' },
  ] }, { id: 'examples', title: 'Examples', items: [{ id: 'international', title: '仕事のメモ · ملاحظات · Long names remain readable with a complete accessible label', subtitle: 'Public multilingual fixture', actions: [open] }] },
], actions: [{ id: 'refresh', title: 'Refresh library', kind: 'invoke', effect: 'read' }] };
export const detail: ViewModel = { protocolVersion: 1, viewId: 'guide-detail', revision: 1, kind: 'detail', title: 'A calmer workspace', markdown: '# Keep the important things close\n\nA collection is a **small, useful set** of commands and documents.\n\n- Start with what you use every day.\n- Give each item a name you recognize.\n- Keep changes local until you choose to share.\n\n## Keyboard rhythm\n\nUse `Ctrl+K` to find actions, and `Escape` to return.\n\n> A little structure leaves more room for the work.\n\n[Read the public guide](https://example.org/guide)\n\n```text\nCollect → choose → continue\n```', metadata: [{ label: 'Location', value: 'Local examples' }, { label: 'Format', value: 'Markdown' }], attachments: [], actions: [copy] };
export const grid: ViewModel = { ...list, kind: 'grid', viewId: 'gallery', title: 'Collections', density: 'comfortable', images: [{ itemId: 'guide', source: { kind: 'asset', assetId: 'public-cover' } }], sections: list.sections.map(section => ({ ...section, items: section.items.map(item => ({ ...item, subtitle: item.id === 'guide' ? 'Image unavailable · stable layout' : item.subtitle })) })) };
export const form: ViewModel = { protocolVersion: 1, viewId: 'collection-form', revision: 1, kind: 'form', title: 'New collection', fields: [
  { id: 'name', kind: 'text', title: 'Collection name', description: 'Use a name you can recognize in search.', required: true, value: '' },
  { id: 'category', kind: 'enum', title: 'Category', required: true, value: 'work', options: [{ label: 'Work', value: 'work' }, { label: 'Personal', value: 'personal' }] },
  { id: 'limit', kind: 'number', title: 'Item limit', required: false, value: 20, min: 1, max: 100 },
  { id: 'date', kind: 'date', title: 'Review date', required: false, value: null },
  { id: 'pinned', kind: 'boolean', title: 'Pin this collection', required: false, value: false },
  { id: 'folder', kind: 'directory', title: 'Folder', required: false, value: null, description: 'Only a directory you choose can be attached.' },
  { id: 'credential', kind: 'secret', title: 'Optional credential', required: false, description: 'Kept in memory until the host stores a credential handle.' },
], submitActionId: 'save', cancelActionId: 'cancel', actions: [{ id: 'save', title: 'Create collection', kind: 'invoke', effect: 'write' }, { id: 'cancel', title: 'Cancel', kind: 'navigate', effect: 'read' }] };
export const split: ViewModel = { protocolVersion: 1, viewId: 'notes-split', revision: 1, kind: 'list', title: 'Reading list', search: { placeholder: 'Search reading list…', query: '', mode: 'host' }, sections: [
  { id: 'docs', title: 'Documents', items: [
    { id: 'brief', title: 'Launch brief', subtitle: '~/Documents/Public/brief.md', icon: { kind: 'builtin', name: 'file' }, actions: [open, copy, remove], preview: { kind: 'text', text: '# Launch brief\n\nA **public** synthetic preview.\n\n- Keep the list readable.\n- Keep the preview beside it.\n\n[Public guide](https://example.org/guide)' } },
    { id: 'handbook', title: 'Public handbook.pdf', subtitle: '~/Documents/Public/handbook.pdf', icon: { kind: 'builtin', name: 'file' }, actions: [open, copy], preview: { kind: 'pdf', source: { kind: 'asset', assetId: 'public-handbook' } } },
    { id: 'cover', title: 'Cover image', subtitle: 'Packaged image preview', icon: { kind: 'builtin', name: 'folder' }, actions: [open], preview: { kind: 'image', source: { kind: 'asset', assetId: 'public-cover' } } },
  ] },
] };
const glyphs = [['grinning', '😀', 'Grinning face'], ['smile', '😊', 'Smiling face with smiling eyes'], ['wink', '😉', 'Winking face'], ['think', '🤔', 'Thinking face'], ['cool', '😎', 'Smiling face with sunglasses'], ['party', '🥳', 'Partying face'], ['sleep', '😴', 'Sleeping face'], ['nerd', '🤓', 'Nerd face'], ['penguin', '🐧', 'Penguin'], ['fox', '🦊', 'Fox'], ['turtle', '🐢', 'Turtle'], ['owl', '🦉', 'Owl'], ['seedling', '🌱', 'Seedling']] as const;
const glyphItem = ([id, value, title]: readonly [string, string, string]) => ({ id, title, icon: { kind: 'glyph' as const, value }, actions: [{ id: 'copy-glyph', title: 'Copy emoji', kind: 'copy' as const, effect: 'write' as const }] });
export const glyphGrid: ViewModel = { protocolVersion: 1, viewId: 'public-glyphs', revision: 1, kind: 'grid', title: 'Public glyphs', density: 'compact', images: [], search: { placeholder: 'Search public glyphs…', query: '', mode: 'host' }, sections: [
  { id: 'faces', title: 'Smileys', items: glyphs.slice(0, 8).map(glyphItem) },
  { id: 'nature', title: 'Animals and nature', items: [...glyphs.slice(8).map(glyphItem), { id: 'unavailable', title: 'Unavailable public glyph', icon: { kind: 'glyph' as const, value: '🦄' }, disabledReason: 'Not available in this public fixture.' }] },
] };
export const note: ViewModel = { protocolVersion: 1, viewId: 'public-note', revision: 1, kind: 'text', title: 'Public note', text: 'First public line', editable: true, submitActionId: 'save-text', actions: [{ id: 'save-text', title: 'Save note', kind: 'invoke', effect: 'write' }, copy] };
export const longList: ViewModel = { protocolVersion: 1, viewId: 'long-library', revision: 1, kind: 'list', title: 'Long library', search: { placeholder: 'Search long library…', query: '', mode: 'host' }, sections: [
  { id: 'all', title: 'All public items', items: Array.from({ length: 60 }, (_, index) => ({ id: `item-${index + 1}`, title: `Public item ${String(index + 1).padStart(2, '0')}`, subtitle: 'Synthetic row', icon: { kind: 'builtin' as const, name: 'file' }, actions: [open, copy] })) },
] };
