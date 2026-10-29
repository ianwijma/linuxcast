import { defineConfig } from 'vitest/config';

const files: string[] = JSON.parse(process.env.LINUXCAST_TEST_FILES ?? '[]');
if (!files.length) throw new Error('Use a bun run test:* command to select the intended suite.');
export default defineConfig({
  esbuild: { jsx: "automatic" },
  // Desktop scenarios rebuild the same output directory before launching Electron.
  test: { fileParallelism: !files.some(file=>file.startsWith('apps/desktop/tests/')), include: files, passWithNoTests: false, allowOnly: false, environment: 'node' },
});
