-- Issue #48 sessions were validly issued before csrfTokenCiphertext existed.
-- Their opaque CSRF value cannot be recovered because only its hash was
-- persisted. Revoke only those legacy active sessions rather than inventing
-- or storing a plaintext replacement token; users can safely log in again.
UPDATE "AuthSession"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "csrfTokenCiphertext" IS NULL
  AND "revokedAt" IS NULL
  AND "expiresAt" > CURRENT_TIMESTAMP;
