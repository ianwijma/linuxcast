import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
