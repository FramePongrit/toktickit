# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| Test File tests/lab-01/ | Tool | Test Description | Result |
|---|---|---|---|
| health.test.ts | Supertest | Health endpoint returns 200 and expected JSON | Pass |
| categories.test.ts | Supertest | Categories endpoint returns the four seeded categories | Pass |
| App.test.tsx | Vitest | TokTickIT heading renders | Pass |
| App.test.tsx | Vitest | shows Online and the seeded categories on success | Pass |
| App.test.tsx | Vitest | shows an Offline error message when the API is unavailable | Pass |

Paste your passing terminal output / screenshot below.

*(นำภาพ Screenshot หรือ Copy ข้อความจาก Terminal ตอนรัน `npm test` ทั้งของ Frontend และ Backend ที่ขึ้นว่า Pass มาวางตรงนี้)*
