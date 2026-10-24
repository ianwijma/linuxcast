import { jsonValueSchema } from './json-value.ts';
import { ContractError, MAX_JSON_DEPTH } from './protocol.ts';

/** JSON.parse discards duplicate fields. Reject ambiguity before schema dispatch. */
export function parseJson(text: string): unknown {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new ContractError('Invalid JSON envelope.'); }
  const stack: Array<Set<string> | null> = [];
  let key = false;
  for (let i = 0; i < text.length; i++) {
    const token = text[i];
    if (token === '"') {
      const start = i++;
      while (text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      const name = JSON.parse(text.slice(start, i + 1)) as string;
      // Rust strings are Unicode scalar values; do not silently replace a lone
      // UTF-16 surrogate when a JS string crosses the UTF-8 transport boundary.
      for (let n = 0; n < name.length; n++) {
        const code = name.charCodeAt(n);
        if (code >= 0xd800 && code <= 0xdbff) {
          const low = name.charCodeAt(++n);
          if (!(low >= 0xdc00 && low <= 0xdfff)) throw new ContractError('Invalid Unicode string.');
        } else if (code >= 0xdc00 && code <= 0xdfff) throw new ContractError('Invalid Unicode string.');
      }
      const object = stack.at(-1);
      if (object && key) {
        if (object.has(name)) throw new ContractError('Duplicate JSON field.');
        object.add(name);
      }
    } else if (token === '{' || token === '[') {
      stack.push(token === '{' ? new Set() : null);
      key = token === '{';
      if (stack.length > MAX_JSON_DEPTH) throw new ContractError('JSON nesting exceeds 64 levels.');
    }
    else if (token === '}' || token === ']') { stack.pop(); key = false; }
    else if (token === ':') key = false;
    else if (token === ',') key = stack.at(-1) !== null;
  }
  // JSON.parse permits numeric overflow (1e400 -> Infinity); JSON wire values do not.
  if (!jsonValueSchema.safeParse(value).success) throw new ContractError('Invalid JSON envelope.');
  return value;
}
