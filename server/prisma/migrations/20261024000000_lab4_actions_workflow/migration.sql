CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ActionRevisionOperation" AS ENUM ('CREATE', 'EDIT', 'TRANSITION', 'TICKET_CANCEL');
CREATE TYPE "TicketWorkflowEventKind" AS ENUM ('CREATED', 'BASELINE', 'TRANSITION');

ALTER TABLE "Ticket"
    ADD COLUMN "workCycle" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "resolvedAt" TIMESTAMP(3);

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_workCycle_check" CHECK ("workCycle" > 0),
    ADD CONSTRAINT "Ticket_version_check" CHECK ("version" > 0);

CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "workCycle" INTEGER NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "description" TEXT NOT NULL,
    "result" TEXT,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "performedById" INTEGER,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,
    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionTaken_positive_state_check" CHECK ("workCycle" > 0 AND "version" > 0),
    CONSTRAINT "ActionTaken_follow_up_note_check" CHECK (
        NOT "followUpRequired" OR ("followUpNote" IS NOT NULL AND btrim("followUpNote") <> '')
    ),
    CONSTRAINT "ActionTaken_terminal_state_check" CHECK (
        (
            "status" IN ('PLANNED', 'IN_PROGRESS')
            AND "completedAt" IS NULL AND "performedById" IS NULL
            AND "cancelledAt" IS NULL AND "cancelledById" IS NULL AND "cancelReason" IS NULL
        ) OR (
            "status" = 'COMPLETED'
            AND "completedAt" IS NOT NULL AND "performedById" IS NOT NULL
            AND "cancelledAt" IS NULL AND "cancelledById" IS NULL AND "cancelReason" IS NULL
            AND "result" IS NOT NULL AND btrim("result") <> ''
        ) OR (
            "status" = 'CANCELLED'
            AND "completedAt" IS NULL AND "performedById" IS NULL
            AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL
            AND "cancelReason" IS NOT NULL AND btrim("cancelReason") <> ''
        )
    )
);

CREATE TABLE "ActionRevision" (
    "id" SERIAL NOT NULL,
    "actionId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operation" "ActionRevisionOperation" NOT NULL,
    "actorId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB NOT NULL,
    CONSTRAINT "ActionRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionRevision_sequence_check" CHECK ("sequence" > 0)
);

CREATE TABLE "TicketWorkflowEvent" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "workCycle" INTEGER NOT NULL,
    "kind" "TicketWorkflowEventKind" NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus" NOT NULL,
    "actorId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicCommentId" INTEGER,
    "reason" TEXT,
    "ticketVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "TicketWorkflowEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketWorkflowEvent_positive_state_check" CHECK ("workCycle" > 0 AND "ticketVersion" > 0),
    CONSTRAINT "TicketWorkflowEvent_shape_check" CHECK (
        ("kind" = 'BASELINE' AND "fromStatus" IS NULL AND "actorId" IS NULL)
        OR ("kind" = 'CREATED' AND "fromStatus" IS NULL AND "actorId" IS NOT NULL AND "toStatus" = 'NEW')
        OR ("kind" = 'TRANSITION' AND "fromStatus" IS NOT NULL AND "actorId" IS NOT NULL AND "fromStatus" <> "toStatus")
    ),
    CONSTRAINT "TicketWorkflowEvent_waiting_comment_check" CHECK (
        "kind" <> 'TRANSITION'
        OR (("toStatus" = 'WAITING_FOR_REQUESTER' AND "publicCommentId" IS NOT NULL)
        OR ("toStatus" <> 'WAITING_FOR_REQUESTER' AND "publicCommentId" IS NULL))
    ),
    CONSTRAINT "TicketWorkflowEvent_cancel_reason_check" CHECK (
        "kind" <> 'TRANSITION' OR "toStatus" <> 'CANCELLED' OR ("reason" IS NOT NULL AND btrim("reason") <> '')
    )
);

CREATE TABLE "IdempotencyRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "method" VARCHAR(6) NOT NULL,
    "canonicalPath" VARCHAR(500) NOT NULL,
    "key" UUID NOT NULL,
    "payloadDigest" CHAR(64) NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdempotencyRecord_method_check" CHECK ("method" IN ('POST', 'PATCH')),
    CONSTRAINT "IdempotencyRecord_key_v4_check" CHECK ("key"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT "IdempotencyRecord_payload_digest_check" CHECK ("payloadDigest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "IdempotencyRecord_success_status_check" CHECK ("httpStatus" BETWEEN 200 AND 299)
);

CREATE INDEX "Ticket_requesterId_updatedAt_id_idx" ON "Ticket"("requesterId", "updatedAt", "id");
CREATE INDEX "Ticket_requesterId_currentStatus_resolvedAt_id_idx" ON "Ticket"("requesterId", "currentStatus", "resolvedAt", "id");
CREATE INDEX "Ticket_currentStatus_itPriority_updatedAt_id_idx" ON "Ticket"("currentStatus", "itPriority", "updatedAt", "id");
CREATE INDEX "ActionTaken_ticketId_createdAt_id_idx" ON "ActionTaken"("ticketId", "createdAt", "id");
CREATE INDEX "ActionTaken_ticketId_workCycle_status_idx" ON "ActionTaken"("ticketId", "workCycle", "status");
CREATE INDEX "ActionTaken_assigneeId_status_ticketId_idx" ON "ActionTaken"("assigneeId", "status", "ticketId");
CREATE INDEX "ActionTaken_performedById_completedAt_id_idx" ON "ActionTaken"("performedById", "completedAt", "id");
CREATE UNIQUE INDEX "ActionRevision_actionId_sequence_key" ON "ActionRevision"("actionId", "sequence");
CREATE INDEX "TicketWorkflowEvent_ticketId_occurredAt_id_idx" ON "TicketWorkflowEvent"("ticketId", "occurredAt", "id");
CREATE UNIQUE INDEX "IdempotencyRecord_userId_method_canonicalPath_key_key" ON "IdempotencyRecord"("userId", "method", "canonicalPath", "key");

ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionRevision" ADD CONSTRAINT "ActionRevision_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "ActionTaken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionRevision" ADD CONSTRAINT "ActionRevision_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketWorkflowEvent" ADD CONSTRAINT "TicketWorkflowEvent_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketWorkflowEvent" ADD CONSTRAINT "TicketWorkflowEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketWorkflowEvent" ADD CONSTRAINT "TicketWorkflowEvent_publicCommentId_fkey"
    FOREIGN KEY ("publicCommentId") REFERENCES "PublicComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "TicketWorkflowEvent" ("ticketId", "workCycle", "kind", "fromStatus", "toStatus", "actorId", "occurredAt", "ticketVersion")
SELECT "id", 1, 'BASELINE', NULL, "currentStatus", NULL, CURRENT_TIMESTAMP, 1
FROM "Ticket";
