import { build } from "esbuild";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import tokens from "../../docs/design/tokens.json" with { type: "json" };
export const spikeRoot = fileURLToPath(new URL(".", import.meta.url));
export async function buildLauncher() {
  const out = join(spikeRoot, "dist");
  const renderer = join(out, "renderer");
  await mkdir(renderer, { recursive: true });
  await build({
    entryPoints: [join(spikeRoot, "src/main.ts")],
    outfile: join(out, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron"],
    logLevel: "silent",
  });
  await build({
    entryPoints: [join(spikeRoot, "src/preload.ts")],
    outfile: join(out, "preload.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron"],
    logLevel: "silent",
  });
  await build({
    entryPoints: [join(spikeRoot, "src/renderer/main.tsx")],
    outfile: join(renderer, "app.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome140",
    jsx: "automatic",
    loader: { ".woff2": "file", ".woff": "file" },
    assetNames: "assets/[name]-[hash]",
    logLevel: "silent",
  });
  await cp(
    join(spikeRoot, "resources/index.html"),
    join(renderer, "index.html"),
  );
  const variables = {
    ...Object.fromEntries(tokens.spacing.map((n) => [`space-${n}`, `${n}px`])),
    ...Object.fromEntries(
      Object.entries(tokens.font).map(([k, v]) => [`font-${k}`, v]),
    ),
    ...Object.fromEntries(
      Object.entries(tokens.fontSize).map(([k, v]) => [`type-${k}`, `${v}px`]),
    ),
    ...Object.fromEntries(
      Object.entries(tokens.radius).map(([k, v]) => [`radius-${k}`, `${v}px`]),
    ),
    "header-height": `${tokens.layout.headerHeight}px`,
    "row-height": `${tokens.layout.rowHeight}px`,
    "footer-height": `${tokens.layout.footerHeight}px`,
    "action-panel-width": `${tokens.layout.actionPanelWidth}px`,
  };
  const declarations = (values: Record<string, string>) =>
    Object.entries(values)
      .map(([key, value]) => `--${key}:${value};`)
      .join("");
  await writeFile(
    join(renderer, "tokens.css"),
    `:root{${declarations(variables)}}\n${Object.entries(tokens.themes)
      .map(
        ([theme, values]) =>
          `main[data-theme="${theme}"]{${declarations(values)}}`,
      )
      .join("\n")}`,
  );
  const files: string[] = [];
  async function walk(path: string) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const name = join(path, item.name);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile()) files.push(relative(renderer, name));
    }
  }
  await walk(renderer);
  await writeFile(join(out, "assets.json"), JSON.stringify(files.sort()));
  return join(out, "main.cjs");
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(await buildLauncher());
