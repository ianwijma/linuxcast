import * as z from 'zod';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const MAX_JSON_DEPTH = 64;

function isJson(value: unknown, depth = 0): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth >= MAX_JSON_DEPTH) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    return keys.length === value.length && keys.every(key => String(Number(key)) === key &&
      Number(key) >= 0 && Number(key) < value.length) && value.every(v => isJson(v, depth + 1));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  return Object.values(value).every(v => isJson(v, depth + 1));
}

// Preserve every own JSON key. Zod's built-in record/JSON parsers omit __proto__,
// which would hide an unknown parameter from a later strict method validator.
export const jsonValueSchema = z.custom<JsonValue>(value => isJson(value));
export const failureDetailsSchema = z.custom<Record<string, string | number | boolean>>(value =>
  isJson(value) && value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.values(value).every(v => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number'));
