-- Lab 3 Issue 2: evolve the Lab 2 identity and workflow schema in place.
-- The existing Ticket and Attachment tables are altered only; their rows,
-- primary keys, foreign keys, ticket numbers, metadata, and stored files are
-- never copied, dropped, or recreated.

-- RequesterUser becomes User without changing any identity values. PostgreSQL
-- updates existing foreign-key references when a referenced table is renamed.
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER INDEX "RequesterUser_active_idx" RENAME TO "User_active_idx";

ALTER TABLE "User" DROP COLUMN "department";
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "User"
        GROUP BY lower(trim("email"))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot normalize legacy User emails because case or whitespace duplicates exist. Resolve the duplicates before the Lab 3 migration.';
    END IF;
END $$;
UPDATE "User" SET "email" = lower(trim("email"));

-- Expand the enum without rebuilding Ticket or rewriting currentStatus rows.
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN' AFTER 'NEW';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS' AFTER 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER' AFTER 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED' AFTER 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED' AFTER 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED' AFTER 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED' AFTER 'CLOSED';

ALTER TABLE "Ticket" ADD COLUMN "itPriority" "Priority";
UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;
ALTER TABLE "Ticket" ADD COLUMN "ownerId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "resolutionIndicatedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "resolutionIndicatedById" INTEGER;

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_csrfTokenHash_key" ON "AuthSession"("csrfTokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_revokedAt_expiresAt_idx" ON "AuthSession"("revokedAt", "expiresAt");

CREATE INDEX "User_active_role_idx" ON "User"("active", "role");
CREATE INDEX "User_role_active_fullName_idx" ON "User"("role", "active", "fullName");
DROP INDEX "User_active_idx";
CREATE INDEX "Ticket_ownerId_currentStatus_idx" ON "Ticket"("ownerId", "currentStatus");
CREATE INDEX "Ticket_currentStatus_itPriority_createdAt_id_idx" ON "Ticket"("currentStatus", "itPriority", "createdAt", "id");
CREATE INDEX "Ticket_resolutionIndicatedById_idx" ON "Ticket"("resolutionIndicatedById");
CREATE INDEX "PublicComment_ticketId_createdAt_id_idx" ON "PublicComment"("ticketId", "createdAt", "id");
CREATE INDEX "PublicComment_authorId_createdAt_idx" ON "PublicComment"("authorId", "createdAt");
CREATE INDEX "InternalNote_ticketId_createdAt_id_idx" ON "InternalNote"("ticketId", "createdAt", "id");
CREATE INDEX "InternalNote_authorId_createdAt_idx" ON "InternalNote"("authorId", "createdAt");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_resolutionIndicatedById_fkey"
    FOREIGN KEY ("resolutionIndicatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
