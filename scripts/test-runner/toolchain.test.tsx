import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'esbuild';
import { compile } from 'tailwindcss';
import { build } from 'vite';

test('React 19 JSX compiles and escapes untrusted display text', async () => {
  const html = renderToStaticMarkup(<span>{'<script>untrusted fixture</script>'}</span>);
  expect(html).toBe('<span>&lt;script&gt;untrusted fixture&lt;/script&gt;</span>');
  const output = await transform('export const fixture = <span>fixture</span>', { loader: 'tsx', jsx: 'automatic' });
  expect(output.code).toContain('react/jsx-runtime');
});

test('Tailwind 4 compiles utilities and Vite 7 builds without writing output', async () => {
  const css = (await compile('@tailwind utilities;')).build(['flex', 'items-center']);
  expect(css).toContain('display: flex');
  expect(css).toContain('align-items: center');
  const output = await build({
    configFile: false, logLevel: 'silent',
    plugins: [{ name: 'bootstrap-fixture', resolveId: id => id === 'virtual:bootstrap' ? '\0fixture' : null,
      load: id => id === '\0fixture' ? 'export const value = 42;' : null }],
    build: { write: false, rollupOptions: { input: 'virtual:bootstrap', preserveEntrySignatures: 'strict' }, minify: false },
  });
  const bundles = Array.isArray(output) ? output : [output];
  expect(bundles.some(bundle => 'output' in bundle && bundle.output.some(chunk => chunk.type === 'chunk' && chunk.code.includes('42')))).toBe(true);
});
