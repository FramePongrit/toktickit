# Lab 3 — AI Use and Reflection

**Source record:** `D:\Software Engineering\lab3_ai_use_staging.md` (outside the repository)

**AI tool:** OpenAI Codex desktop agent. The Lab 3 implementation workflow used `gpt-5.6-luna` with xhigh reasoning as Executor and one `gpt-5.6-terra` medium Advisor for Standards and Spec review, with reports recorded in the external staging log.

The entries below are selected from the prompt-by-prompt staging record. They are intentionally concise summaries of the prompts and their effect on the work, not reconstructed verbatim assistant dialogue.

## Selected Lab 3 workflow prompts

| Prompt | User request | Effect on the work |
|---|---|---|
| P-01 | “เข้าไปอ่าน code base ของ webapp และทำความเข้าใจ business requirement เรียงตั้งแต่ละเอกสาร lab 1 จนถึง lab 2 แล้วทำความเข้าใจหน่อย” | Established Lab 2 behavior, data ownership, tests, and documents as the compatibility baseline before planning Lab 3. |
| P-02 | “ตอนนี้ผมได้เพิ่ม lab 3 เข้ามา สรุปให้หน่อยว่า lab3 ต้องทำไรบ้าง” | Split the handout into authentication, authorization, ticket operations, Admin User Management, tests, screenshots, documentation, and Git/Kanban evidence. |
| P-03 | “[$grill-with-docs] วางแผนทำ lab 3 ให้ละเอียด ให้แตกงานออกมาเป็น task แล้วก็ทำให้เป็น issue เพราะผมต้อง PR ใน github เองแต่ละ issue เพราะต้องเก็บ kanban board workflow” | Turned the requirements into an ordered 18-Issue roadmap and made one Issue/one PR/Kanban traceability an explicit delivery constraint. |
| P-04 | “ใช้ JWT ได้ไหม” | Chose a signed JWT in an HttpOnly cookie backed by a database `AuthSession`, so logout, password changes, resets, role changes, and deactivation can revoke access immediately. |
| P-09 | “เก็บ pass แบบ bcrypt กับ hash ลง db ต่างกันยังไง” | Made the password rule concrete: store only bcrypt output at cost 12, never plaintext; this became part of the contract and test plan. |
| P-14 | “ถ้ามี close ไป 1 ticket แล้วเวลาผ่านไป 1 สัปดาห์ เกิดปัญหาเดิมซ้ำ ต้องกลับมา reopen ticket นี้หรอ ... เปิด ticket ใหม่” | Defined `CLOSED`/`CANCELLED` as final historical states and treated a later recurrence as a new Ticket; only `RESOLVED` can move to `REOPENED`. |
| P-15 | “`Waiting for Requester` คือไร” | Defined the business meaning of the state and required an explanatory Public Comment to be committed atomically with the transition. |
| P-29 | “Staff คนหนึ่งเป็น Owner ของ Ticket ที่ยังไม่จบ 15 ใบ แล้ว Admin กด deactivate อันนี้คุณหมายถึงว่า deactivate staff ใช่ไหม” | Focused the safety rule on User deactivation/demotion and required reassignment before leaving non-final Tickets with an ineligible Owner. |
| P-55 | “คือมันสร้าง issue ก่อนค่อย implement หรอ” | Confirmed the loop: create/specify Issue → branch from `lab3-staging` → implement with tests → review/fix → Draft PR → human review/merge → close Issue and update Kanban. |
| P-57/P-58 | “แต่เหมือน claude สร้าง PR ได้ แล้วคุณทำได้ไหม” and “ให้คุณใช้ CLI github เปิด PR ได้ไหม ... ผมจะตรวจ แล้วก็ให้ reviewer ตรวจอีก” | Established that GitHub CLI can open Draft PRs after authorization while merge remains under the student and peer reviewer; this led to the local portable `gh` setup. |

## How the implementation loop was used

The external record shows the same loop for the implementation Issues: Luna reported changed paths and validations; Terra reviewed the same change set on separate Standards and Spec axes; distinct findings were returned to Luna; re-review continued until both axes passed; only then was a Draft PR opened. For Issue #61, the final executor report recorded the integrated verification totals in [tests.md](./tests.md), and PR [#79](https://github.com/FramePongrit/toktickit/pull/79) was approved and merged into `lab3-staging`.

## My reflection

Lab 3 taught me to treat the specification, tests, GitHub Issues, and Kanban state as one connected engineering record. The early requirement questions were useful because they forced ambiguous ideas—such as JWT revocation, `Waiting for Requester`, final Tickets, and Staff ownership—into rules that could be implemented and tested.

The most valuable workflow decision was to keep one Issue and one PR per meaningful unit of work. It made the dependency order visible and gave each review a bounded scope. Using an Executor and a separate Advisor also made it easier to distinguish “the code runs” from “the code satisfies the contract”; several review passes found missing race, migration, authorization, or traceability evidence before the PRs were merged.

The final E2E pass reinforced that automated totals are not the whole submission. The integrated run passed the server, client, migration, browser, legacy, and screenshot checks, but the screenshots still had to be inspected against the Zen Green and responsive rules. I am keeping the Issue #62 reviewer and Kanban fields explicit so the final submission records the human review rather than implying that an automated review replaced it.

