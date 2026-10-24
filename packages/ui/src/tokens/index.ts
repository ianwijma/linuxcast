import canonical from '../../../../docs/design/tokens.json' with { type: 'json' };

/** The design contract is the only source of token values. */
export const tokens = canonical;
export type Theme = keyof typeof tokens.themes;
const kebab = (value: string) => value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
const rem = (value: number) => `${value / 16}rem`;

export function tokenCss(): string {
  const declarations = [
    ...Object.entries(tokens.font).map(([key, value]) => `--lc-font-${key}: ${value};`),
    ...Object.entries(tokens.fontSize).map(([key, value]) => `--lc-text-${kebab(key)}: ${rem(value)};`),
    ...tokens.spacing.map(value => `--lc-space-${value}: ${rem(value)};`),
    ...Object.entries(tokens.radius).map(([key, value]) => `--lc-radius-${key}: ${rem(value)};`),
    ...Object.entries(tokens.layout).map(([key, value]) => `--lc-${kebab(key)}: ${rem(value)};`),
    `--lc-motion-state: ${tokens.motion.stateMs}ms;`,
    `--lc-motion-panel: ${tokens.motion.panelMs}ms;`,
  ];
  return `/* Generated from docs/design/tokens.json by tokens/generate.ts. */\n:root {\n  ${declarations.join('\n  ')}\n}\n` +
    Object.entries(tokens.themes).map(([theme, values]) => `[data-lc-theme="${theme}"] {\n  color-scheme: ${theme};\n${Object.entries(values).map(([key, value]) => `  --lc-${kebab(key)}: ${value};`).join('\n')}\n}\n`).join('');
}

export function tailwindCss(): string {
  const aliases = [
    ...Object.keys(tokens.themes.dark).map(key => `--color-${kebab(key)}: var(--lc-${kebab(key)});`),
    ...Object.keys(tokens.font).map(key => `--font-${key}: var(--lc-font-${key});`),
    ...Object.keys(tokens.fontSize).map(key => `--text-${kebab(key)}: var(--lc-text-${kebab(key)});`),
    ...Object.keys(tokens.radius).map(key => `--radius-${key}: var(--lc-radius-${key});`),
    ...tokens.spacing.map(value => `--spacing-${value / 4}: var(--lc-space-${value});`),
  ];
  return `/* Generated semantic aliases; import after Tailwind and tokens.css. */\n@theme inline {\n  ${aliases.join('\n  ')}\n}\n`;
}
