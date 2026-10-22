import { defineConfig } from 'vitest/config';

const files: string[] = JSON.parse(process.env.LINUXCAST_TEST_FILES ?? '[]');
if (!files.length) throw new Error('Use a bun run test:* command to select the intended suite.');
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { include: files, passWithNoTests: false, allowOnly: false, environment: 'node' },
});
