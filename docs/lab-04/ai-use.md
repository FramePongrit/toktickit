# Lab 4 AI Use

LLMs: GPT-6 Luna (Executor) and GPT-6.1 Sol (Reviewer).

## Selected prompts and answers

### 1

**Prompt:**

```text
ผมจะทำงานต่อ โดยอ่านรายละเอียดงานใน lab 4 แล้ว เพราะมีของเดิมอยู่แล้วงานเก่าเป็น lab3 อยากให้สรุปสิ่งที่ต้องทำใน lab 4 ว่ามีอะไรบ้าง เอาให้ครบ
```

**Answer:** สรุปขอบเขต Lab 4 ให้ครบทั้ง Actions Taken, สถานะ/การปิดและ reopen ของ Ticket, dashboards ตาม role, migration/seed/API ที่รักษาข้อมูลเดิม, UI แบบ Zen Green ที่ responsive และเข้าถึงได้, regression/evidence, Git workflow และเอกสาร PDF ทั้ง 9 ส่วนรวม 60 คะแนน. ไม่มีการแก้ product files หรือรันทดสอบ.

### 2

**Prompt:**

```text
[$batch-grill-me](C:\Users\pongr\\.agents\skills\batch-grill-me\SKILL.md) ช่วยวางแผนทำ lab 4 และวาง engineering contract หน่อย
```

**Answer:** Announced use of batch-grill-me and delegated factual repository/handout exploration. Read the invoked skill and ponytail skill. Explained the decision tree: scope → business rules → data/API/UI → AC/tests → Issues/release.

### 3

**Prompt:**

```text
อยากให้ทำเป็น workflow แบบนี้นะ 
ให้คุณเป็น orchestrator และทำหน้าที่ดูแล git workflow และ kanban board ห้ามจบ turn จนกว่า subagent จะทำงานเสร็จ ให้คุณเปิด issue และ PR ไปจนผมบอกว่า review และปิด PR แล้ว
และให้คุณ spawn subagent ออกเพียง 2 ตัวเท่านั้น โดยมี 1. executor agent (gpt 6 luna extra-high) ที่คอย implement code ตาม contract 2. reviewer agent (gpt 6.1 sol medium) ที่คอยตรวจ code แล้วส่ง feedback กลับไปให้ executor แก้
โดยทั้ง 2 subagent ให้
```

**Answer:** Accepted the completed orchestration rule. Ponytail full was read and is mandatory in every Executor implementation and Reviewer review prompt. The orchestrator will use exactly two new subagents: Executor requested as gpt-6-luna at extra-high (mapped to the platform's highest available supported effort) and Reviewer requested as gpt-6.1-sol at medium.

### 4

**Prompt:**

```text
งั้นแก้เลย ผมเปิด docker แล้ว
```

**Answer:** Original migration raw Git blob593d4e9c3a20dd51797aeb11837ca6a534c9c0ac exactly matches current unfiltered file. Published correction commit9b29487 followed by documentation/artifact commit0a75793f7b9989f576bf72a8d741d952afb6ee2e. Evidence includes complete sanitized Executor migration12/fullserver206/Prisma-build/diff outputs and Reviewer migration12 output plus reproduction/source index.

### 5

**Prompt:**

```text
merge และ review แล้ว ทำ issue ต่อไปได้เลย
```

**Answer:** Docker Desktop เปิดแล้ว crash ที่ `dockerInference` ครับ ช่วยกด Quit แล้วเปิด Docker ใหม่ และแจ้งเมื่อพร้อมได้ไหมครับ? ระหว่างนี้ผมให้ agents ทำ UI และ component tests ต่ออยู่

### 6

**Prompt:**

```text
ทำต่อจากที่ค้างไว้เลย
```

**Answer:** Issue88 ActionsUI complete, PR98 OPENinto lab4-staging/KanbanPRReview; client185/server236/builds/newbrowser1+oldStaff2pass, independent31client/browser1pass,3viewport/statecaptures published. Exactsource60e9d9d anddocs-only93c108e verified, cleanworktree, bothagentscomplete. Preserveinitialparentrefresh timeout+unchangedpassingretry andoneunrecoverableDBcoordinationverbatimgap inAIlog.

### 7

**Prompt:**

```text
กลับไป trace 8 test ที่ไม่ผ่านได้ไหม
```

**Answer:** Original8 failures cannot be individually traced because raw log/names/time/revision were not retained. Fresh default-parallel run5failed/214passed, including AppShell heading, ChangePassword gate heading, validation timeout and clear assertion, ActionsTaken create timeout. Unchanged two-worker run219passed and serial219passed.

### 8

**Prompt:**

```text
งั้นเพิ่มเลยครับ แล้วลงมือทำต่อเลย
```

**Answer:** Recommended CI for every feature PR, implemented once and run automatically. Original plan placed broader quality work in #91; PR100 reviewer requests at least client tests/build before merge, so user authorized implementing it now. Server/database/E2E CI can be extended in #91.

### 9

**Prompt:**

```text
เปิดแล้ว
```

**Answer:** PR100 source correction90b6ec4 and docs/evidence commit120a580 pushed; final PR head120a580 has successful GitHub Actions PR run41020428176 and push run41020421880, with uploaded client log artifact client-check-logs-41020428176-1. Default npm test now uses two workers, local20files/228tests+build passed; Reviewer independent7files/71tests passed.

### 10

**Prompt:**

```text
เข้าไปดู review แล้วแก้ตามหน่อย
```

**Answer:** Applied latest peer follow-up via permitted known-limitation alternative: explicit five real waitFor checks/three Queue scenarios, real300ms debounce,1500ms maximum; worker cap and one fake-timer test do not prove uncapped stability or explain original8. Documentation-only commit88372980be0a93438c4d2e5b5769f9a00c6328d0 pushed.

## My Reflection

During Lab 4, I used AI to help me understand the assignment, develop the specification, and break the work into smaller tasks before implementation. I defined the scope and workflow, with an Executor to implement changes and a Reviewer to check them. This made the work easier to organize and track, but I still had to read the feedback and decide what to fix next.

Some tests failed and we encountered environment issues, including timing-sensitive tests and a Windows PowerShell problem. This showed me that an AI saying a task is complete or tests pass is not enough: I need to look at the actual results, investigate the cause, and distinguish verified findings from things that remain uncertain. I also had a teammate review the PRs.

I personally checked parts of the Requester, Staff, and Admin experiences, including keyboard navigation, forms, and layouts. Some visual and accessibility checks still need to be completed. After the release, we also need to run the tests on main and collect the evidence for submission.
