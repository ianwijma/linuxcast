import { mkdirSync, lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep, dirname } from "node:path";
/** Disposable profile, never the normal client profile or another application's data. */
export function prepareProfile(value: string | undefined): string {
  const base = realpathSync(tmpdir());
  const path = value
    ? resolve(value)
    : join(base, `linuxcast-launcher-${process.getuid?.() ?? "user"}`);
  if (dirname(path) !== base || !path.startsWith(`${base}${sep}linuxcast-launcher-`))
    throw new Error("Invalid disposable launcher profile.");
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = lstatSync(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    realpathSync(path) !== path
  )
    throw new Error("Disposable launcher profile is not private.");
  return path;
}
