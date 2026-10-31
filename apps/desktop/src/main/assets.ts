import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

export const APP_SCHEME = 'linuxcast-app';
export const APP_ORIGIN = `${APP_SCHEME}://shell/`;
export const NOTES_URL = `${APP_ORIGIN}notes.html`;
export const FILE_SEARCH_URL = `${APP_ORIGIN}file-search.html`;
export const WORKFLOW_EDITOR_URL = `${APP_ORIGIN}workflow-editor.html`;
export const CREDENTIAL_SETTINGS_URL = `${APP_ORIGIN}credential-settings.html`;
export const DATA_SETTINGS_URL = `${APP_ORIGIN}data-settings.html`;
export const PERMISSION_SETTINGS_URL = `${APP_ORIGIN}permission-settings.html`;
export const APP_URL = `${APP_ORIGIN}index.html`;
export const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; frame-ancestors 'none'";
const mime: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function parseAssetManifest(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > 4096 || !value.includes('index.html') ||
      value.some(name => typeof name !== 'string' || name.length > 256 ||
        !/^[A-Za-z0-9_./-]+$/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..') ||
        !Object.hasOwn(mime, extname(name)) || (extname(name) === '.html' && !['index.html','credential-settings.html','data-settings.html','permission-settings.html','file-search.html','workflow-editor.html','notes.html'].includes(name))) ||
      new Set(value).size !== value.length)
    throw new Error('Invalid packaged resource manifest.');
  return new Set(value as string[]);
}

export function assetName(url: string, assets: ReadonlySet<string>): string | undefined {
  // Exact serialized URLs reject credentials, ports, escaping, traversal, query and fragments.
  if (!url.startsWith(APP_ORIGIN)) return undefined;
  const name = url.slice(APP_ORIGIN.length);
  return assets.has(name) ? name : undefined;
}

export async function createAssetHandler(root: string, assets: ReadonlySet<string>) {
  const directory = await realpath(root);
  return async (request: { url: string; method: string }): Promise<Response> => {
    const name = assetName(request.url, assets);
    if (request.method !== 'GET' || !name) return new Response('Not found', { status: 404 });
    try {
      const file = await realpath(resolve(directory, name));
      const child = relative(directory, file);
      if (child === '..' || child.startsWith('../') || isAbsolute(child))
        return new Response('Not found', { status: 404 });
      const info = await stat(file);
      if (!info.isFile() || info.size > 16 * 1024 * 1024) return new Response('Not found', { status: 404 });
      return new Response(await readFile(file), { headers: {
        'Content-Type': mime[extname(name)]!,
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      } });
    } catch { return new Response('Not found', { status: 404 }); }
  };
}
