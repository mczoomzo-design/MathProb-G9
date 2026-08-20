# คู่มือติดตั้ง — เกมความน่าจะเป็น ม.3 (GAS + GitHub Pages)

ระบบแบ่งเป็น 2 ส่วน:
- **Backend** = Google Apps Script (Web App) + Google Sheets เป็นฐานข้อมูล
- **Frontend** = ไฟล์ในโฟลเดอร์ `frontend/` วางบน GitHub Pages เรียก backend ผ่าน URL

---

## ส่วนที่ 1 — ตั้งค่า Backend (Google Apps Script)

1. เปิด https://sheets.google.com สร้าง Google Sheet ใหม่ 1 ไฟล์ (ตั้งชื่ออะไรก็ได้ เช่น "ProbGame DB")
2. บนเมนู เลือก **Extensions → Apps Script**
3. ลบโค้ดตัวอย่างในไฟล์ `Code.gs` ที่ขึ้นมา แล้ววางเนื้อหาจากไฟล์ `Code.gs` ในโปรเจกต์นี้ทั้งหมด กด 💾 บันทึก
4. ที่แถบเลือกฟังก์ชันด้านบน เลือก **`setup`** แล้วกด **▶ Run**
   - ครั้งแรกจะขออนุญาต ให้กด Review permissions → เลือกบัญชี → Advanced → Go to (project) → Allow
   - เมื่อรันเสร็จ กลับไปดูใน Google Sheet จะมี 3 ชีตใหม่: `Profiles`, `Scores`, `Questions` (พร้อมโจทย์ตั้งต้น 11 ข้อ)
5. **Deploy เป็น Web App:**
   - กด **Deploy → New deployment**
   - ไอคอนเฟือง ⚙ เลือก **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด **Deploy** → คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

### (ถ้าจะใช้ปุ่ม "สร้างโจทย์ใหม่ด้วย AI")
6. กลับไปที่ Apps Script → **Project Settings** (ไอคอนเฟือง ⚙ ด้านซ้าย)
7. เลื่อนลงหา **Script properties → Add script property**
   - Property: `ANTHROPIC_API_KEY`
   - Value: คีย์ API ของคุณ (`sk-ant-...`)
   - กด Save
   - ปุ่ม AI ในเว็บจะเรียก Claude สร้างโจทย์ใหม่ เก็บเข้าคลังใน Sheet ให้อัตโนมัติ

> ถ้าไม่ใส่คีย์ ปุ่ม AI จะแจ้งเตือน แต่โหมดเล่นทั้งหมดยังทำงานปกติจากคลังโจทย์ในชีต

---

## ส่วนที่ 2 — ตั้งค่า Frontend (GitHub Pages)

1. เปิดไฟล์ `frontend/config.js` แก้บรรทัดเดียว วาง Web app URL ที่ได้จากข้อ 5:
   ```js
   window.API_URL = 'https://script.google.com/macros/s/AKfycb..../exec';
   ```
2. สร้าง GitHub repo ใหม่ อัปโหลด **ไฟล์ในโฟลเดอร์ `frontend/` ทั้งหมด** (`index.html`, `game.js`, `config.js`) ไว้ที่ root ของ repo
3. ใน repo ไปที่ **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / folder **/(root)** → Save
4. รอสักครู่ GitHub จะให้ URL เว็บ เช่น `https://ชื่อคุณ.github.io/ชื่อ-repo/` เปิดเล่นได้เลย

---

## ส่วนที่ 3 — ระบบจัดการโจทย์สำหรับครู (Admin)

เว็บมีปุ่ม **⚙ สำหรับครู** มุมขวาบน กดแล้วใส่รหัสผ่านเพื่อ เพิ่ม/แก้ไข/ลบ โจทย์ในคลัง (ชีต Questions)

1. ตั้งรหัสผ่าน: ใน Apps Script → **Project Settings → Script properties → Add**
   - Property: `ADMIN_PIN`  ค่า: รหัสที่ต้องการ (ถ้าไม่ตั้ง ค่าเริ่มต้นคือ `1234` — ควรเปลี่ยน)
2. ในเว็บกด **⚙ สำหรับครู** → ใส่รหัส → จัดการโจทย์ได้เลย
   - โจทย์ที่ครูเพิ่มเป็นแบบเลือกตอบ 4 ตัวเลือก จะถูกสุ่มมาผสมกับคำถามหลายรูปแบบที่ระบบสร้างอัตโนมัติตอนเล่น

> โหมดออนไลน์เรียลไทม์ (Firebase) ถูกถอดออกแล้วตามที่ขอ — ระบบตอนนี้ใช้แค่ Apps Script + GitHub ไม่ต้องตั้งค่า Firebase

---

## ตรวจว่าทำงานถูก

- เปิดเว็บ ถ้ามุมบนแสดง **"● เชื่อมต่อเซิร์ฟเวอร์แล้ว"** = frontend คุยกับ backend ได้
- ถ้าแสดง **"○ โหมดออฟไลน์"** = ยังไม่ได้ใส่ URL ใน config.js หรือ URL ผิด (เกมยังเล่นได้ด้วยโจทย์ในเครื่อง แต่ Rank/กระดานคะแนนจะไม่รวมศูนย์)
- เล่นจบ 1 เกม แล้วเปิด Google Sheet ดู ชีต `Scores` และ `Profiles` ต้องมีข้อมูลเพิ่ม

---

## โครงฐานข้อมูล (Google Sheets)

**Profiles** — 1 แถวต่อผู้เล่น 1 คน (ผูกด้วยชื่อ)
`name | passwordHash | xp | rank | dailyLastDate | dailyStreak | createdAt | lastPlayed`

**Scores** — log ทุกครั้งที่เล่นจบ ใช้ทำกระดานคะแนน
`name | mode | score | rank | timestamp`

**Questions** — คลังโจทย์ (seed + ที่ AI สร้าง)
`id | topic | difficulty | text | opt1..opt4 | correctIndex | explanation | source | createdAt`

---

## อยากแก้ไข/ต่อยอด

- **เพิ่มโจทย์เอง:** พิมพ์ลงชีต `Questions` ตรงๆ ได้เลย (correctIndex เริ่มนับจาก 0)
- **ปรับเกณฑ์ Rank:** แก้ตัวแปร `RANKS` ทั้งใน `Code.gs` และ `game.js` ให้ตรงกัน
- **ปรับ XP ที่ได้:** แก้ `Math.round(score * 0.5)` ใน `apiSaveScore_` (Code.gs)
- **ระบบล็อกอินจริง (กันสวมชื่อ):** ช่อง `passwordHash` เตรียมไว้แล้ว ยังไม่เปิดใช้ — ถ้าต้องการค่อยเพิ่ม action `register`/`login`
