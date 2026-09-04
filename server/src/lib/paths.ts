import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * server/uploads. The directory is gitignored but must exist on a fresh clone,
 * so a .gitkeep is committed and it is also created at boot — belt and braces,
 * because the first upload otherwise fails with ENOENT.
 */
export const UPLOAD_DIR = path.resolve(here, "..", "..", "uploads");

export function ensureUploadDir(): void {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function storedFilePath(storedFilename: string): string {
  // storedFilename is always a server-generated UUID plus an extension, never
  // anything the requester supplied, so it cannot escape UPLOAD_DIR (BR-36).
  return path.join(UPLOAD_DIR, storedFilename);
}

/** Deletes a file if it is there, ignoring the case where it is not. */
export async function deleteFileIfPresent(absolutePath: string): Promise<void> {
  await fs.promises.rm(absolutePath, { force: true });
}
