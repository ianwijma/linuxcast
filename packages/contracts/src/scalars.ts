import * as z from 'zod';
export const MAX_UI_TEXT_BYTES = 64 * 1024;
const encoder = new TextEncoder();
/** Extension declarative text fields share one UTF-8 byte boundary. */
export const uiTextSchema = z.string().refine(value => encoder.encode(value).byteLength <= MAX_UI_TEXT_BYTES);
