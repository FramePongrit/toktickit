import type { CorsOptions } from "cors";
import type { SecurityConfig } from "./config.js";

export const CORS_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];
export const CORS_HEADERS = ["Content-Type", "X-CSRF-Token", "Accept"];

export function createCredentialedCorsOptions(config: SecurityConfig): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, origin === config.clientOrigin ? config.clientOrigin : false);
    },
    credentials: true,
    methods: CORS_METHODS,
    allowedHeaders: CORS_HEADERS,
    optionsSuccessStatus: 204,
  };
}
