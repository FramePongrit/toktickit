-- Preserve the opaque CSRF token for authenticated shell bootstrap without
-- storing it as plaintext. Existing sessions remain valid for verification;
-- sessions created after this migration can also be recovered by /auth/me.
ALTER TABLE "AuthSession"
ADD COLUMN "csrfTokenCiphertext" TEXT;
