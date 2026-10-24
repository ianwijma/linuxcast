import { startResidentShell } from './shell.ts';

// esbuild emits this entry and the sandboxed preload as CommonJS beside assets.json.
startResidentShell({ resourcesDirectory: __dirname });
