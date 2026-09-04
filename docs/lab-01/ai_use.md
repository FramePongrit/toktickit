# Lab 1 — AI Use and Reflection

**LLM/agent used:** Antigravity (Gemini 3.1 Pro High)

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | อ่าน Lab1_Labsheet.pdf และสรุปให้หน่อยว่าต้องทำอะไรบ้าง | Agent ช่วยสรุปโครงสร้างของ 4 Issues ให้ ทำให้ผมเห็นภาพรวมของโปรเจกต์และเริ่มต้นงานได้เร็วขึ้น |
| 2 | ทำทีละ issue ไป และ อย่าพึ่งไป push ลง ทำ code ให้เสร็จและรายงานความพร้อม | ผมให้ Agent เริ่มเซ็ตอัพ Issue 1 (React, Vite, Express, Prisma) ซึ่ง Agent ก็ได้เตรียมไฟล์และติดตั้ง Dependencies ให้ครบถ้วน |
| 3 | ตอนนี้ผมเชื่อม vpn อยู่ผมต้องออกไหม แล้วค่อยต่อ postgres server ไหม | Agent อธิบายว่า Localhost ไม่ต้องออก VPN ทำให้ผมเข้าใจระบบเน็ตเวิร์กของ Database ท้องถิ่นมากขึ้น |
| 4 | ควรลง postgres เลย หรือ docker ดี | Agent แนะนำ Docker พร้อมให้คำสั่งรันแบบบรรทัดเดียวจบ ทำให้ผมสามารถเซ็ต Database ได้ในเวลาไม่ถึงนาที |
| 5 | เรียบร้อยแล้ว docker check db ใหม่ให้หน่อย | Agent ทำการรัน `npx prisma db pull` เพื่อตรวจสอบการเชื่อมต่อ และช่วยยืนยันว่า Database พร้อมใช้งาน |
| 6 | commit แล้วไงค่อ หมายถึงต้องทำไงต่อกับ github | Agent ช่วยอธิบายขั้นตอน Git Workflow ในการทำ Pull Request ให้ผมทำตามสเต็ปบน GitHub ได้ถูกต้อง |
| 7 | ผมหลงไป push ลง feature/1-project-foundation | Agent ยืนยันว่าผมทำถูกต้องแล้ว (การทำ Feature branch) ทำให้ผมไม่สับสนระหว่างการทำงานกับ Git Flow |
| 8 | merge เข้า staging แล้ว ไปต่อ issue ต่อไปเลย | สั่งให้ Agent ข้ามมาทำ Issue 2 ซึ่ง Agent ก็ทำ Route Health Check และทดสอบ Supertest ให้เรียบร้อย |
| 9 | เรียบร้อย ไปต่อเลย (ทำ Issue 3 และ 4) | Agent ดำเนินการเพิ่ม Model Category ใน Prisma, รัน Migrate, สร้างไฟล์ Seed และอัปเดตหน้า UI เพื่อแสดงหมวดหมู่ได้อย่างสมบูรณ์แบบ |

## Reflection
การใช้ Agent ทำให้ผมตั้งค่าโครงสร้างเริ่มต้นได้เร็วมาก สิ่งที่ทำให้ Prompt มีประสิทธิภาพคือการบอกให้ทำงานทีละ Issue (Step-by-step) ทำให้จัดการและตรวจสอบได้ง่าย อย่างไรก็ตาม ผมต้องใช้ Prompt เพื่อถามรายละเอียดเพิ่มเติมเวลาติดขัดเรื่องเครื่องมือเช่น Docker หรือ Git Flow แต่ Agent ก็ช่วยอธิบายและรันคำสั่งแก้ไขให้ได้ทันที ทำให้เห็นว่าการใช้ AI ไม่ใช่แค่เขียนโค้ด แต่รวมถึงการช่วยไขปัญหา Architecture และ Workflow ได้ดีมากครับ
