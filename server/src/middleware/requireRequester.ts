import { requireRequesterRole } from "./authorization.js";

/**
 * Compatibility name for the preserved Requester routes. The old
 * X-Requester-Id development selector is intentionally gone: identity comes
 * only from the authenticated session populated by authentication.ts.
 */
export const requireRequester = requireRequesterRole;
