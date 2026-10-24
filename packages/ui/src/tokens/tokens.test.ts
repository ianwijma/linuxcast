import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { tailwindCss, tokenCss, tokens } from './index.ts';

test('committed CSS bindings stay synchronized with the canonical design contract', () => {
  expect(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')).toBe(tokenCss());
  expect(readFileSync(new URL('./tailwind.css', import.meta.url), 'utf8')).toBe(tailwindCss());
});

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
for (const [name, theme] of Object.entries(tokens.themes)) {
  test(`${name} actual text/state and focus colors satisfy the contrast contract`, () => {
    for (const surface of [theme.background, theme.surface, theme.raised, theme.selection]) {
      for (const text of [theme.text, theme.muted, theme.danger, theme.warning, theme.success]) expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.focus, surface)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(theme.accentText, theme.accent)).toBeGreaterThanOrEqual(4.5);
  });
}
