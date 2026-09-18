import { createApp } from "../src/app.js";
import { createDevelopmentSecurityConfig } from "../src/security/config.js";

// Server tests intentionally opt into the non-secure local cookie profile.
// Production startup never imports this helper and must provide validated env.
export const app = createApp(createDevelopmentSecurityConfig());
