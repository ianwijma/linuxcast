import { defineConfig } from '@playwright/test';

const files: string[] = JSON.parse(process.env.LINUXCAST_TEST_FILES ?? '[]');
if (!files.length) throw new Error('Use a bun run test:* command to select the intended suite.');
export default defineConfig({ testDir: '../..', testMatch: files, forbidOnly: true, retries: 0 });
