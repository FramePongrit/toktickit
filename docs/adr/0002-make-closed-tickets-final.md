# Make Closed and Cancelled Tickets Final

**Status:** Accepted

## Decision

Lab 3 treats both `CLOSED` and `CANCELLED` as Final, read-only Ticket states. `RESOLVED` remains a reviewable, Non-final post-fix state and is the only status allowed to transition to `REOPENED`. Neither `CLOSED` nor `CANCELLED` can transition to `REOPENED` or any other status.

A problem that persists while its Ticket is `RESOLVED` may transition to `REOPENED`. A later recurrence after either Final state is represented by a new Ticket, not by reopening the historical Ticket.

## Rationale

This preserves distinct incident history and avoids combining elapsed time and work from separate occurrences in one record.
