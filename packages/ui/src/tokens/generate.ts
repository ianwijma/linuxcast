import { writeFile } from 'node:fs/promises';
import { tokenCss, tailwindCss } from './index.ts';

await writeFile(new URL('./tokens.css', import.meta.url), tokenCss());
await writeFile(new URL('./tailwind.css', import.meta.url), tailwindCss());
