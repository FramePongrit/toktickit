# Actions Taken visual evidence

Captured 2026-10-29, Asia/Bangkok, from the real local app on isolated PostgreSQL fixtures; source `60e9d9d0715af270eeb3b2422c9d54b7e02f017a`, [PR #98](https://github.com/FramePongrit/toktickit/pull/98). These are rendered screenshots, not mockups. Synthetic actor names/Ticket IDs differ across runs. Most curated frames come from Executor's passing journey; the corrected full-page conflict frame comes from Reviewer's independent passing repeat. Complete run details and initial failures are in the [verification index](../../verification/issue88/README.md).

| Scope | Actual capture |
|---|---|
| Desktop1440x900: Staff identity/Ticket, table, earlier-cycle Actions and timeline | [Desktop](actions-view-1440x900.png) |
| Tablet820x1024: responsive cards and timeline | [Tablet](actions-view-820x1024.png) |
| Mobile390x844: cards/wrapping and visible heading | [Mobile](actions-view-390x844.png) |
| Mobile identity variant with existing navigation expanded | [Mobile role/Ticket](actions-view-390x844-identity.png) |
| Initial Actions view | [Before work](actions-view-desktop-before-work.png) |
| Resolution gate without Completed evidence | [Gate](resolution-gate-no-completed-action.png) |
| Inline create with server-derived Bangkok date/default assignee | [Create](action-create-form.png) |
| Ambiguous create response, retained values and exact retry | [Retry](action-create-ambiguous-failure.png) |
| Pending edit with disabled Zen-green outlines | [Busy styling](action-edit-pending-disabled-outline.png) |
| Readable before/after history, without raw JSON | [Audit](action-history-readable-correction.png) |
| Complete with Result/date/follow-up fields | [Complete](action-complete-form.png) |
| Terminal correction and immutable identity fields | [Correction](action-terminal-correction-form.png) |
| Real409: banner, submitted versions, reload action, retained draft and disabled save | [Conflict review](action-edit-conflict-review.png) |
| Action cancellation reason form | [Cancel Action](action-cancellation-form.png) |
| Requester identity, own historical/cancelled data and public timeline; no private audit/write controls | [Requester read-only](requester-read-only-action-deep-link.png) |

Root and AI Reviewer inspected the table/cards, labels, long-name/text wrapping, role/Ticket context, editable/read-only hierarchy, conflict/retry forms, readable audit and disabled color. Browser geometry assertions reported no horizontal page overflow, clipped controls or overlap at all three sizes. Automated keyboard/focus and computed-style checks complement visual review; human screen-reader/increased-text and whole-application visual checks remain pending. Dashboard screenshots are not part of this increment.
