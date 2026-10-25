ALTER TABLE "TicketWorkflowEvent"
    DROP CONSTRAINT "TicketWorkflowEvent_publicCommentId_fkey",
    ADD CONSTRAINT "TicketWorkflowEvent_publicCommentId_fkey"
    FOREIGN KEY ("publicCommentId") REFERENCES "PublicComment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
