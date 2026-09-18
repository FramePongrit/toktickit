import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

export interface EnvironmentLoadOptions {
  path?: string;
  environment?: NodeJS.ProcessEnv;
}

/**
 * Loads the server-local .env for both tsx (src/) and compiled Node (dist/)
 * starts. dotenv's default override=false preserves values injected by a
 * deployment environment over local file values.
 */
export function loadServerEnvironment(options: EnvironmentLoadOptions = {}): void {
  const environment = options.environment ?? process.env;
  const envPath =
    options.path ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
  const result = dotenv.config({
    path: envPath,
    override: false,
    processEnv: environment as Record<string, string>,
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw result.error;
  }
}
