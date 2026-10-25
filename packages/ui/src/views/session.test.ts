import { describe, expect, it } from 'vitest';
import { ViewSession } from './session.ts';
import { list, detail } from './fixtures/models.ts';
import { safeLink } from './markdown.tsx';
describe('declarative host state', () => {
  it('rejects executable fields, non-JSON values, oversized and unsupported models', () => {
    for (const value of [{ ...list, onClick: () => {} }, { ...list, html: '<script />' }, { ...list, protocolVersion: 2 }, { ...list, title: 'a'.repeat(1_048_577) }, { ...list, kind: 'webview' }]) { const session = new ViewSession(value); expect(session.getSnapshot().error).toBe(true); expect(session.getSnapshot().frames).toHaveLength(0); }
  });
  it('preserves stable selection and query across ordered updates, stale revisions and snapshot gaps', () => {
    const session = new ViewSession(list); session.select('library', 'work'); session.setQuery('library', 'planning');
    expect(session.update('library', { protocolVersion: 1, kind: 'items', viewId: 'library', baseRevision: 1, revision: 2, operations: [{ kind: 'upsert', sectionId: 'recent', index: 0, item: { id: 'new', title: 'Planning arrival' } }] }).kind).toBe('applied');
    expect(session.getSnapshot().frames[0]).toMatchObject({ selection: 'work', query: 'planning' });
    expect(session.update('library', { protocolVersion: 1, kind: 'snapshot', view: list }).kind).toBe('discard-stale');
    expect(session.update('library', { protocolVersion: 1, kind: 'items', viewId: 'library', baseRevision: 1, revision: 3, operations: [] }).kind).toBe('request-snapshot');
    expect(session.getSnapshot().frames[0]!.view.revision).toBe(2);
  });
  it('navigation restores host query, selection and scroll and cancels only removed views', () => {
    const cancelled: string[] = []; const session = new ViewSession(list, id => cancelled.push(id)); session.setQuery('library', 'planning'); session.select('library', 'work'); session.saveScroll('library', 120);
    expect(session.navigate({ protocolVersion: 1, kind: 'push', fromViewId: 'library', view: detail })).toBe(true); session.pop();
    expect(session.getSnapshot().frames[0]).toMatchObject({ selection: 'work', query: 'planning', scroll: 120 }); expect(cancelled).toEqual(['guide-detail']);
    expect(session.navigate({ protocolVersion: 1, kind: 'push', fromViewId: 'wrong', view: detail })).toBe(false); session.close(); expect(cancelled).toEqual(['guide-detail', 'library']);
  });
  it('keeps the primary action stable when later results prepend another action', () => {
    const session = new ViewSession(list);
    const current = session.getSnapshot().frames[0]!;
    if (current.view.kind !== 'list') throw new Error('Expected collection');
    const item = current.view.sections[0]!.items[0]!;
    session.update('library', { protocolVersion: 1, kind: 'items', viewId: 'library', baseRevision: 1, revision: 2, operations: [{ kind: 'upsert', sectionId: 'recent', index: 0, item: { ...item, actions: [{ id: 'late', title: 'Later action', kind: 'invoke', effect: 'read' }, ...item.actions!] } }] });
    expect(session.getSnapshot().frames[0]!.primaryAction).toBe('open');
    session.setQuery('library', '界'.repeat(30000)); expect(session.getSnapshot().frames[0]!.query).toBe('');
  });
  it('rejects unsafe schemes, credential-bearing and malformed links', () => {
    for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'data:text/html,a', 'https://user:password@example.org', '//example.org', 'https://exa\nmple.org']) expect(safeLink(url)).toBeNull();
    expect(safeLink('https://example.org/guide')).toBe('https://example.org/guide');
  });
});

it('accepts exactly the production packaged image route and rejects URL bypasses', async () => {
  const { safeImageSource } = await import('./images.ts');
  const { APP_ORIGIN, assetName, parseAssetManifest } = await import('../../../../apps/desktop/src/main/assets.ts');
  const assets = parseAssetManifest(['index.html', 'assets/public-icon.png']);
  const valid = `${APP_ORIGIN}assets/public-icon.png`;
  expect(assetName(valid, assets)).toBe('assets/public-icon.png'); expect(safeImageSource(valid)).toBe(valid);
  for (const url of ['linuxcast://app/assets/public-icon.png', 'linuxcast-app://user@shell/assets/public-icon.png', 'linuxcast-app://shell:80/assets/public-icon.png', `${valid}?track=1`, `${valid}#fragment`, `${APP_ORIGIN}assets/../public-icon.png`, `${APP_ORIGIN}assets/%2e%2e/public-icon.png`, `${APP_ORIGIN}assets//public-icon.png`, `${APP_ORIGIN}index.html`, 'blob:linuxcast-app://shell/public', 'https://example.org/icon.png']) expect(safeImageSource(url)).toBeNull();
});
