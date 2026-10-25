/** Mirrors the existing packaged asset route's exact serialized origin/path policy.
 * The main protocol handler still enforces manifest membership and filesystem bounds.
 * Blob images remain unavailable under the current production img-src 'self' CSP. */
export function safeImageSource(value: string): string | null {
  const origin = 'linuxcast-app://shell/';
  if (!value.startsWith(origin)) return null;
  const name = value.slice(origin.length);
  return name.length <= 256 && /^[A-Za-z0-9_./-]+$/.test(name) &&
    !name.split('/').some(part => !part || part === '.' || part === '..') && /\.(?:png|svg|ico)$/.test(name) ? value : null;
}
