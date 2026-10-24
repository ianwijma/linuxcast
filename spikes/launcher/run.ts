import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { buildLauncher } from "./build.ts";
const require = createRequire(import.meta.url);
const executable = require("electron") as string;
const main = await buildLauncher();
const child = spawn(executable, [main, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
