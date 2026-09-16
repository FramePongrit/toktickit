# TokTickIT Support

This context covers the people, access states, Ticket lifecycle, ownership, communication, and queue concepts used to request, coordinate, and administer IT assistance in TokTickIT.

## Language

### Users and Access

**User**:
A person with one TokTickIT identity and exactly one Role. A User may be an Active User or Inactive User.
_Avoid_: Account holder, member

**Requester**:
A User who requests IT assistance and can access only Tickets they submitted.
_Avoid_: Customer, Development Requester

**IT Staff**:
A User who processes Tickets across the Staff Queue.
_Avoid_: Agent, technician

**Administrator**:
A User who has all IT Staff capabilities and additionally manages Users.
_Avoid_: Superuser

**Role**:
The single responsibility category assigned to a User: Requester, IT Staff, or Administrator.
_Avoid_: Permission group, user type

**Initial Password**:
A temporary password set by an Administrator or local seed data that a User must replace before entering the normal application.
_Avoid_: Default password, permanent password

**Active User**:
A User permitted to authenticate and, subject to their Role, participate in TokTickIT workflows.
_Avoid_: Enabled account

**Inactive User**:
A User retained for historical identity but not permitted to authenticate or perform new actions.
_Avoid_: Deleted User, disabled record

**Mandatory Password Change**:
The access state that restricts a User to changing an Initial Password before normal role-based work is available.
_Avoid_: Password reminder, optional reset

**Initial Password Reset**:
An Administrator action that replaces another User's credential with a new Initial Password and returns that User to Mandatory Password Change.
_Avoid_: Password recovery, reveal password

**Deactivation**:
An Administrator action that changes an Active User into an Inactive User without deleting their historical identity.
_Avoid_: Delete User, suspend Ticket

**Demotion**:
A Role change from Administrator or IT Staff to a Role with fewer operational capabilities, especially Requester.
_Avoid_: Deactivation, deletion

**Last Active Administrator**:
The sole remaining Active User with the Administrator Role, whose deactivation or demotion is prohibited so administration remains possible.
_Avoid_: Primary Administrator, owner account

### Tickets and Ownership

**Ticket**:
A record of one IT assistance request submitted by a Requester.
_Avoid_: Case, job

**Ticket Requester**:
The Requester who submitted and owns access to a Ticket's requester-facing information and actions.
_Avoid_: Ticket Owner, assignee

**Ticket Owner**:
The IT Staff member or Administrator primarily responsible for progressing a Ticket. Ownership is required before a status transition and, while the Ticket is non-final, the Owner must remain active and in a permitted Role.
_Avoid_: Requester, ticket creator, assignee

**Unassigned Ticket**:
A Ticket that does not yet have a Ticket Owner. It may be created and viewed in this state, but its status cannot transition until it is Claimed.
_Avoid_: Ownerless request, orphaned Ticket

**Claim**:
The act of an IT Staff member or Administrator becoming the Ticket Owner of an Unassigned Ticket.
_Avoid_: Reassign, take

**Reassign**:
The act of replacing an existing Ticket Owner with another Active User whose Role is IT Staff or Administrator.
_Avoid_: Claim, unassign, transfer

**Historical Owner**:
The Ticket Owner retained on a Final Ticket for historical meaning even if that User later becomes inactive or changes Role.
_Avoid_: Current assignee, archived User

**Non-final Ticket**:
A Ticket whose status is not Closed or Cancelled. It may still participate in the actions allowed by its current status; Resolved is non-final.
_Avoid_: Active Queue Ticket, unfinished Ticket

**Final Ticket**:
A Ticket whose status is Closed or Cancelled and whose contents are read-only. Its Historical Owner remains part of the record.
_Avoid_: Resolved Ticket, archived Ticket

**Recurrence**:
A new occurrence of a problem after its earlier Ticket became Closed. A Recurrence is represented by a new Ticket rather than reopening the Closed Ticket.
_Avoid_: Reopened Ticket, duplicate Ticket

### Priority and Resolution

**Requested Priority**:
The immutable urgency selected by the Ticket Requester when a Ticket is submitted.
_Avoid_: Priority, IT Priority

**IT Priority**:
The operational urgency assessed by IT Staff or an Administrator. It initially matches Requested Priority but remains a separate value visible to the Ticket Requester.
_Avoid_: Priority, requester priority

**Resolution Indication**:
A Ticket Requester's indication that the reported problem appears resolved; it does not formally resolve, close, or otherwise change Ticket status. A Ticket has at most one current indication, which is cleared when the Ticket is Reopened.
_Avoid_: Resolution request, requester-resolved status, Resolved

### Ticket Statuses

**Status Transition**:
A permitted move from one Ticket status to another by IT Staff or an Administrator after the Ticket has an active permitted Owner.
_Avoid_: Status edit, Claim

**New**:
A Ticket status meaning the request has been submitted but not yet acknowledged for work.
_Avoid_: Unread

**Open**:
A Ticket status meaning the request has been acknowledged and is ready for active work.
_Avoid_: Active

**In Progress**:
A Ticket status meaning the Ticket Owner is actively working on the request.
_Avoid_: Working

**Waiting for Requester**:
A Ticket status meaning progress is temporarily blocked while the Ticket Owner waits for information or action from the Ticket Requester. Entering this status includes a Public Comment explaining what is needed; a Requester reply does not itself change the status.
_Avoid_: Pending, waiting for support

**Resolved**:
A non-final Ticket status meaning a solution has been applied but the outcome is not yet final. A Resolved Ticket may become Closed or Reopened.
_Avoid_: Fixed, completed, Closed

**Reopened**:
A Ticket status meaning a solution did not hold while the Ticket was still Resolved and operational work must resume.
_Avoid_: Open, recurring Closed Ticket

**Closed**:
A Final Ticket status meaning the support request is complete. A later Recurrence is represented by a new Ticket.
_Avoid_: Resolved, archived

**Cancelled**:
A Final Ticket status meaning work on the request was intentionally discontinued without resolution.
_Avoid_: Deleted, rejected

### Communication and Queue

**Public Comment**:
An append-only message on a Non-final Ticket shared among its Ticket Requester, IT Staff, and Administrators.
_Avoid_: Reply, note

**Internal Note**:
An append-only operational message on a Non-final Ticket visible only to IT Staff and Administrators.
_Avoid_: Private comment, staff comment

**Waiting Explanation**:
The Public Comment created together with a transition to Waiting for Requester that states what information or action IT needs.
_Avoid_: Internal Note, status reason

**Staff Queue**:
The operational collection through which IT Staff and Administrators find, prioritize, and open Tickets across all Requesters.
_Avoid_: My Tickets, admin list

**Active Queue Ticket**:
A Ticket in New, Open, In Progress, Waiting for Requester, or Reopened and therefore included in the Staff Queue's default scope. Resolved is non-final but is excluded from this default operational scope.
_Avoid_: Non-final Ticket, Open Ticket

**All Tickets Scope**:
The explicit Staff Queue scope that includes Tickets in every status, including Resolved and Final Tickets.
_Avoid_: Active Queue, archive
