import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ORIGIN, APP_URL, assetName, createAssetHandler, parseAssetManifest } from './assets.ts';
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('packaged asset boundary', () => {
  const assets = parseAssetManifest(['index.html', 'app.js', 'assets/font.woff2']);
  it('accepts only exact manifest URLs', () => {
    expect(assetName(APP_URL, assets)).toBe('index.html');
    for (const url of [APP_URL + '?secret=x', APP_URL + '#x', APP_ORIGIN + '../index.html',
      APP_ORIGIN + '%69ndex.html', APP_ORIGIN + 'private.txt',
      'linuxcast-app://user:password@shell/index.html', 'linuxcast-app://shell:443/index.html',
      'https://shell/index.html', 'file:///index.html']) expect(assetName(url, assets)).toBeUndefined();
  });
  it.each([null, {}, [], ['app.js'], ['index.html', '../secret.js'], ['index.html', '/app.js'],
    ['index.html', 'nested//app.js'], ['index.html', 'index.html'], ['index.html', 'other.html'],
    ['index.html', 'private.json'], ['index.html', 'a\\b.js'], ['index.html', 'x%20.js']])('rejects malformed build manifests', value => { expect(() => parseAssetManifest(value)).toThrow(); });
  it('serves only contained regular assets with enforced CSP and fixed failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linuxcast-assets-')); temporary.push(root);
    await mkdir(join(root, 'renderer'));
    await writeFile(join(root, 'renderer/index.html'), '<main>Linuxcast</main>');
    await writeFile(join(root, 'outside.js'), 'SYNTHETIC_PRIVATE');
    await symlink(join(root, 'outside.js'), join(root, 'renderer/app.js'));
    const handle = await createAssetHandler(join(root, 'renderer'), assets);
    const good = await handle({ url: APP_URL, method: 'GET' });
    expect(good.status).toBe(200);
    expect(good.headers.get('Content-Security-Policy')).toContain("connect-src 'none'");
    expect(good.headers.get('Content-Security-Policy')).not.toMatch(/unsafe-|https:|\*/);
    expect(good.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await good.text()).toBe('<main>Linuxcast</main>');
    for (const request of [{ url: APP_ORIGIN + 'app.js', method: 'GET' },
      { url: APP_URL, method: 'POST' }, { url: APP_ORIGIN + 'missing.js', method: 'GET' }]) {
      const response = await handle(request);
      expect(response.status).toBe(404); expect(await response.text()).toBe('Not found');
    }
  });
});
