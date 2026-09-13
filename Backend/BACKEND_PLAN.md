# Qudrat LMS — Backend Plan (POC API)

Node.js REST API for the Qudrat LMS proof of concept. This document is the build
brief for the backend: stack, data model, every endpoint and which screen calls
it, plus a seeder that mirrors the current front-end mock data exactly so the two
halves line up on day one of integration.

- **Front end:** React + Vite SPA (already built). Today it keeps all state in
  `localStorage` via `src/context/DataContext.jsx`. That file is the single
  integration seam — see [§9 Front-end integration](#9-front-end-integration).
- **Goal of this phase:** a running API with real persistence and auth, seeded
  with demo data, good enough to demo end to end and to hand to a client.
- **Not in scope for the POC:** email, notifications, real file storage at scale,
  audit logs, multi-tenant, rate limiting, refresh-token rotation.

---

## 1. Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | **Node 20 LTS**, ES modules | Matches the front-end toolchain |
| HTTP framework | **Express 4** | Smallest learning curve, everyone knows it |
| DB | **PostgreSQL 16** | Real relational DB; `docker compose up` in one line |
| ORM / migrations | **Prisma 5** | Type-safe client, painless migrations, great seeding story |
| Auth | **JWT** (`jsonwebtoken`) + **bcryptjs** | Stateless, no session store needed for a POC |
| Validation | **Zod** | Same schemas reusable on the front end later |
| Config | **dotenv** | — |
| Dev ergonomics | **tsx**/`node --watch`, **pino-http** logging, **cors** | — |
| File uploads (optional) | **multer** → local disk, served statically | Mock-grade, swap for S3 later |

> **SQLite fallback:** if Postgres is inconvenient, set `provider = "sqlite"` in
> `schema.prisma` and `DATABASE_URL="file:./dev.db"`. You then lose native enums —
> replace each `enum` with `String` and keep the Zod validation as the gatekeeper.
> Everything else in this document is unchanged.

---

## 2. Folder structure

```
qudrat-lms-api/
├── prisma/
│   ├── schema.prisma
│   └── seed.js                 # §8 — mirrors the front-end seed data
├── src/
│   ├── server.js               # boot: load env, start HTTP listener
│   ├── app.js                  # express app: middleware + route mounting
│   ├── lib/
│   │   ├── prisma.js           # singleton PrismaClient
│   │   ├── jwt.js              # sign / verify helpers
│   │   ├── grades.js           # weighted-grade + GPA formula (§7)
│   │   └── serialize.js        # DB row → API shape (keeps front-end contract)
│   ├── middleware/
│   │   ├── auth.js             # requireAuth, requireRole, attachUser
│   │   ├── validate.js         # zod body/query validation wrapper
│   │   └── error.js            # central error handler + 404
│   └── modules/
│       ├── auth/               # login, me
│       ├── users/             # student management + instructor list
│       ├── courses/           # course CRUD + summary + roster + gradebook
│       ├── enrollments/       # enrol / drop / catalog
│       ├── materials/
│       ├── quizzes/           # quiz CRUD + attempts (server-side grading)
│       ├── assignments/       # assignment CRUD + submissions + grading
│       ├── attendance/
│       ├── grades/            # manual gradebook entries (marks / scoring)
│       ├── dashboard/         # admin + student aggregate endpoints
│       └── uploads/           # optional multipart endpoint
├── uploads/                    # local file store (gitignored)
├── .env
├── .env.example
├── docker-compose.yml          # postgres for local dev
└── package.json
```

Every module folder is the same three files:

```
modules/<name>/
├── <name>.routes.js       # express.Router(), wires middleware + controller
├── <name>.controller.js   # req/res only, no business logic
└── <name>.service.js      # Prisma calls + rules, unit-testable
```

---

## 3. Setup & scripts

`.env.example`

```ini
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://qudrat:qudrat@localhost:5432/qudrat_lms?schema=public"
JWT_SECRET="dev-only-change-me"
JWT_EXPIRES_IN="7d"
CORS_ORIGIN="http://localhost:5173"
UPLOAD_DIR="./uploads"
```

`docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: qudrat
      POSTGRES_PASSWORD: qudrat
      POSTGRES_DB: qudrat_lms
    ports: ["5432:5432"]
    volumes: ["qudrat_pg:/var/lib/postgresql/data"]
volumes: { qudrat_pg: {} }
```

`package.json` scripts

```json
{
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "db:up": "docker compose up -d",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force",
    "db:seed": "node prisma/seed.js",
    "db:studio": "prisma studio"
  },
  "prisma": { "seed": "node prisma/seed.js" }
}
```

First run:

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate      # creates tables
npm run db:seed         # loads demo data (§8)
npm run dev             # API on http://localhost:4000
```

---

## 4. API conventions

- **Base URL:** `/api` (e.g. `http://localhost:4000/api/courses`).
- **Auth:** `Authorization: Bearer <jwt>` on everything except `POST /auth/login`
  and `GET /health`.
- **IDs:** strings (`cuid()`). The seeder pins human-readable ids (`c-anat`,
  `s-1001`, …) so demo data matches the front-end seed.
- **Collections** return a bare JSON array (the front end expects arrays).
  Add pagination only where noted: `?page=1&limit=50` → `{ data, page, limit, total }`.
- **Single resources** return the object directly.
- **Dates:** ISO-8601 strings in and out (`2024-01-20T00:00:00.000Z`).
- **Filtering:** documented per endpoint via query params (`?courseId=`, `?studentId=`, `?status=`, `?q=`).
- **Errors:** non-2xx returns

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ … ] } }
  ```

  | Status | `code` | When |
  | --- | --- | --- |
  | 400 | `VALIDATION_ERROR` | Zod rejected body/query |
  | 401 | `UNAUTHENTICATED` | missing/invalid/expired token |
  | 403 | `FORBIDDEN` | wrong role, or student touching another student's data |
  | 404 | `NOT_FOUND` | unknown id |
  | 409 | `CONFLICT` | duplicate (already enrolled, already submitted, email taken) |
  | 500 | `INTERNAL` | unhandled |

- **Cascades** are done in the DB (`onDelete: Cascade`) so deleting a course or a
  student cleans up its enrolments, materials, assessments, attendance and marks —
  matching the front end's `removeWhere` cleanup today.

---

## 5. Data model

### 5.1 Entity relationships

```
User ──< Enrollment >── Course
User ──(instructor 0..1)── Course
Course ──< Material
Course ──< Quiz ──< QuizAttempt >── User
Course ──< Assignment ──< Submission >── User
Course ──< AttendanceSession        (records: JSON { studentId: status })
Course ──< Grade >── User            (manual "marks / scoring" entries)
```

Three structures stay as JSON columns because the front end already treats them as
nested blobs and the POC gains nothing from normalising them:

| Column | Shape |
| --- | --- |
| `Quiz.questions` | `[{ id, text, options: string[], correctIndex, points }]` |
| `QuizAttempt.answers` | `{ [questionId]: optionIndex }` |
| `AttendanceSession.records` | `{ [studentId]: "present" \| "late" \| "excused" \| "absent" }` |

> **Production note:** for grading analytics you'd promote `questions` →
> `QuizQuestion` + `QuizOption` tables and `records` → `AttendanceRecord`. The API
> response shape can stay identical, so this is a backend-only refactor later.

### 5.2 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role             { admin student }
enum CourseStatus     { draft published }
enum EnrollmentStatus { enrolled dropped }
enum MaterialType     { reading pdf slides video image link }
enum SubmissionStatus { submitted graded }
enum AttendanceStatus { present late excused absent }

model User {
  id           String   @id @default(cuid())
  role         Role
  name         String
  email        String   @unique
  passwordHash String
  avatarColor  String   @default("#8A857B")

  // staff only
  title        String?

  // student only
  matric       String?  @unique
  cohort       String?
  phone        String?
  status       String   @default("active")   // "active" | "inactive"

  coursesTaught Course[]      @relation("Instructor")
  enrollments   Enrollment[]
  quizAttempts  QuizAttempt[]
  submissions   Submission[]
  grades        Grade[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Course {
  id          String       @id @default(cuid())
  code        String
  title       String
  description String       @default("")
  credits     Int          @default(3)
  schedule    String       @default("")
  room        String       @default("")
  term        String
  status      CourseStatus @default(draft)

  instructorId String?
  instructor   User?       @relation("Instructor", fields: [instructorId], references: [id], onDelete: SetNull)

  enrollments Enrollment[]
  materials   Material[]
  quizzes     Quiz[]
  assignments Assignment[]
  attendance  AttendanceSession[]
  grades      Grade[]

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([status])
}

model Enrollment {
  id         String           @id @default(cuid())
  course     Course           @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseId   String
  student    User             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  studentId  String
  status     EnrollmentStatus @default(enrolled)
  enrolledAt DateTime         @default(now())

  @@unique([courseId, studentId])
  @@index([studentId])
}

model Material {
  id          String       @id @default(cuid())
  course      Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseId    String
  week        Int          @default(1)
  title       String
  type        MaterialType @default(reading)
  url         String       @default("")
  description String       @default("")
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([courseId])
}

model Quiz {
  id          String        @id @default(cuid())
  course      Course        @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseId    String
  title       String
  description String        @default("")
  dueDate     DateTime?
  published   Boolean       @default(false)
  questions   Json          @default("[]")   // [{ id, text, options[], correctIndex, points }]
  attempts    QuizAttempt[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([courseId])
}

model QuizAttempt {
  id          String   @id @default(cuid())
  quiz        Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)
  quizId      String
  student     User     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  studentId   String
  answers     Json     @default("{}")        // { [questionId]: optionIndex }
  score       Int
  maxScore    Int
  submittedAt DateTime @default(now())

  @@unique([quizId, studentId])              // one attempt per student (POC rule)
}

model Assignment {
  id          String       @id @default(cuid())
  course      Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseId    String
  title       String
  description String       @default("")
  dueDate     DateTime?
  maxPoints   Int          @default(20)
  published   Boolean      @default(true)
  submissions Submission[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([courseId])
}

model Submission {
  id           String           @id @default(cuid())
  assignment   Assignment       @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  assignmentId String
  student      User             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  studentId    String
  note         String           @default("")
  fileName     String           @default("")
  fileUrl      String           @default("")
  submittedAt  DateTime?
  status       SubmissionStatus @default(submitted)
  grade        Int?
  feedback     String           @default("")
  gradedAt     DateTime?

  @@unique([assignmentId, studentId])
}

model AttendanceSession {
  id        String   @id @default(cuid())
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseId  String
  date      DateTime
  topic     String   @default("")
  records   Json     @default("{}")          // { [studentId]: "present" | "late" | "excused" | "absent" }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([courseId])
}

model Grade {
  id         String   @id @default(cuid())
  course     Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseId   String
  student    User     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  studentId  String
  item       String
  category   String   @default("Coursework")
  score      Float
  maxScore   Float
  weight     Float    @default(10)
  note       String   @default("")
  recordedAt DateTime @default(now())

  @@index([courseId, studentId])
}
```

### 5.3 Field reference (API shapes)

The API serialises DB rows to exactly the objects the front end uses today.
`serialize.js` handles two conveniences: `Course.instructor` is flattened to the
instructor's **name string** (with `instructorId` also present), and `Submission`
`status: "missing"` is synthesised for roster members with no row.

**User (student)** — `GET /api/users`, `/api/auth/me`
| field | type | notes |
| --- | --- | --- |
| `id` | string | |
| `role` | `"student"` | |
| `name`, `email` | string | `email` unique |
| `matric` | string | unique, e.g. `QN-2024-1001` |
| `cohort` | string | |
| `phone` | string | |
| `status` | `"active" \| "inactive"` | |
| `avatarColor` | string (hex) | UI avatar tint |
| `password` | string | **write-only**, accepted on create/update, never returned |

**User (staff)** — same minus student fields, plus `title` (e.g. "Clinical Instructor").

**Course** — `GET /api/courses`
| field | type | notes |
| --- | --- | --- |
| `id`, `code`, `title`, `description` | string | |
| `credits` | int | |
| `schedule`, `room`, `term` | string | |
| `status` | `"draft" \| "published"` | students only ever see `published` |
| `instructor` | string | instructor name (derived) |
| `instructorId` | string \| null | FK, used by the course form dropdown |
| `createdAt` | ISO date | |

**Enrollment** — `{ id, courseId, studentId, status: "enrolled" | "dropped", enrolledAt }`

**Material** — `{ id, courseId, week:int, title, type: reading|pdf|slides|video|image|link, url, description, createdAt }`

**Quiz** — `{ id, courseId, title, description, dueDate, published:bool, questions: [{ id, text, options: string[], correctIndex:int, points:int }] }`
> For **students**, `GET /api/quizzes/:id` and the list endpoint strip
> `correctIndex` from every question. It is only included for admins.

**QuizAttempt** — `{ id, quizId, studentId, answers: { [questionId]: optionIndex }, score:int, maxScore:int, submittedAt }`

**Assignment** — `{ id, courseId, title, description, dueDate, maxPoints:int, published:bool }`

**Submission** — `{ id, assignmentId, studentId, note, fileName, fileUrl, submittedAt, status: "submitted"|"graded"|"missing", grade:int|null, feedback }`

**AttendanceSession** — `{ id, courseId, date, topic, records: { [studentId]: "present"|"late"|"excused"|"absent" } }`

**Grade** — `{ id, courseId, studentId, item, category, score:number, maxScore:number, weight:number, note, recordedAt }`

---

## 6. Authentication & authorization

### Flow

```
POST /api/auth/login { email, password }
  → 200 { token, user }            // token = JWT { sub: userId, role }
  → 401 UNAUTHENTICATED            // bad credentials
Front end stores token (localStorage today) and sends it as Bearer on every call.
GET /api/auth/me  → 200 user       // used to re-hydrate the session on reload
```

Passwords are bcrypt-hashed (`bcryptjs`, 10 rounds). The seeder hashes the demo
passwords (`admin123`, `student123`) so the existing front-end login screens keep
working unchanged.

### Rules

| Rule | Enforced by |
| --- | --- |
| Every route except `login` / `health` requires a valid token | `requireAuth` |
| Course/student/material/quiz/assignment/attendance/grade **writes** are staff-only | `requireRole("admin")` |
| A student may read **only their own** attempts, submissions, enrolments, grades | ownership check in service (`studentId === req.user.id`) |
| A student may self-enrol only in `published` courses | `enrollments.service` |
| A student may edit their own submission only while `status !== "graded"` | `submissions.service` |
| Quiz `correctIndex` is never sent to students | `serialize.quizForRole()` |

`middleware/auth.js`:

```js
import { verify } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next({ status: 401, code: "UNAUTHENTICATED" });
  try {
    const { sub } = verify(token);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user) return next({ status: 401, code: "UNAUTHENTICATED" });
    req.user = user;
    next();
  } catch {
    next({ status: 401, code: "UNAUTHENTICATED" });
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next({ status: 403, code: "FORBIDDEN" });
```

---

## 7. Computed values — the grade formula

This must match `src/lib/selectors.js` on the front end (`courseGradeForStudent`,
`letterGrade`) so numbers don't shift during integration. Implement once in
`src/lib/grades.js` and reuse in the dashboard / gradebook endpoints.

```js
// A "component" is one graded thing contributing to the course grade.
// weight is a percentage; percent is score/max * 100.
export function courseGrade(db, courseId, studentId) {
  const parts = [];

  // 1. manual gradebook entries — use their own weight
  db.grades
    .filter(g => g.courseId === courseId && g.studentId === studentId)
    .forEach(g => parts.push({ label: g.item, weight: g.weight || 0, percent: pct(g.score, g.maxScore) }));

  // 2. graded assignment submissions — fixed weight 10
  db.assignments.filter(a => a.courseId === courseId).forEach(a => {
    const s = db.submissions.find(x => x.assignmentId === a.id && x.studentId === studentId);
    if (s && s.status === "graded" && s.grade != null)
      parts.push({ label: a.title, weight: 10, percent: pct(s.grade, a.maxPoints) });
  });

  // 3. quiz attempts — fixed weight 5
  db.quizzes.filter(q => q.courseId === courseId).forEach(q => {
    const r = db.quizAttempts.find(x => x.quizId === q.id && x.studentId === studentId);
    if (r) parts.push({ label: q.title, weight: 5, percent: pct(r.score, r.maxScore) });
  });

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const overall = totalWeight
    ? Math.round(parts.reduce((s, p) => s + p.percent * p.weight, 0) / totalWeight)
    : null;
  return { parts, totalWeight, overall };
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

export const letterGrade = p =>
  p == null ? "—" : p >= 80 ? "A" : p >= 70 ? "B" : p >= 60 ? "C" : p >= 50 ? "D" : "F";

export const gradePoint = p =>
  p >= 80 ? 4 : p >= 70 ? 3 : p >= 60 ? 2 : p >= 50 ? 1 : 0;   // GPA = Σ(point·credits) / Σ credits
```

Attendance rate (matches `attendanceSummary`): a student is "present" for a
session if their record is `present`, `late` or `excused`; rate = present / recorded.

---

## 8. API reference

`✱` = staff only. `•` = any authenticated user. `‡` = student-scoped (own data only).
"Consumed by" points at the front-end file that will call it.

### Auth — `modules/auth`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | public | `{ email, password }` | `{ token, user }` | `context/AuthContext.jsx` → `login()` |
| GET | `/api/auth/me` | • | — | `user` | `AuthContext` session re-hydrate on reload |

### Users / Student Management — `modules/users`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/users` | ✱ | `?role=student\|admin` `?status=` `?q=` | `User[]` | `pages/admin/Students.jsx`; `?role=admin` fills the instructor dropdown in `pages/admin/Courses.jsx` |
| POST | `/api/users` | ✱ | student fields + `password` | `User` | `Students.jsx` → add student |
| GET | `/api/users/:id` | ✱ or ‡ self | — | `User` | — |
| PATCH | `/api/users/:id` | ✱ | partial fields | `User` | `Students.jsx` → edit |
| DELETE | `/api/users/:id` | ✱ | — | `204` (cascades) | `Students.jsx` → delete |

### Courses — `modules/courses`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/courses` | ✱ | `?status=` `?q=` | `Course[]` (all) | `pages/admin/Courses.jsx`, `AdminDashboard.jsx` |
| POST | `/api/courses` | ✱ | course fields | `Course` | `Courses.jsx` → new |
| GET | `/api/courses/:id` | • | — | `Course` | `pages/admin/CourseWorkspace.jsx`, `pages/student/StudentCourseView.jsx` |
| PATCH | `/api/courses/:id` | ✱ | partial | `Course` | `Courses.jsx` → edit |
| DELETE | `/api/courses/:id` | ✱ | — | `204` (cascades) | `Courses.jsx` → delete |
| GET | `/api/courses/:id/summary` | ✱ | — | `{ studentCount, materialCount, quizCount, assignmentCount, sessionCount }` | `pages/admin/course/Overview.jsx` |
| GET | `/api/courses/:id/roster` | ✱ | — | `{ student, enrollment }[]` | `pages/admin/course/RosterTab.jsx` |
| GET | `/api/courses/:id/gradebook` | ✱ | — | `{ student, parts, totalWeight, overall, letter }[]` | `pages/admin/course/GradesTab.jsx` (summary tab) |

### Catalog & enrolment — `modules/enrollments`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/catalog` | ‡ | — | published `Course[]` + `{ enrolledCount, isEnrolled }` | `pages/student/CourseCatalog.jsx` |
| GET | `/api/me/courses` | ‡ | — | enrolled `Course[]` | `pages/student/MyCourses.jsx`, `StudentDashboard.jsx` |
| POST | `/api/courses/:id/enroll` | ‡ | — | `Enrollment` | `CourseCatalog.jsx` → register (self) |
| DELETE | `/api/courses/:id/enroll` | ‡ | — | `204` | `CourseCatalog.jsx` → drop (self) |
| POST | `/api/courses/:id/enrollments` | ✱ | `{ studentIds: [] }` | `Enrollment[]` | `RosterTab.jsx` → enrol students |
| DELETE | `/api/courses/:id/enrollments/:studentId` | ✱ | — | `204` | `RosterTab.jsx` → unenrol |

### Materials — `modules/materials`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/courses/:courseId/materials` | • | — | `Material[]` (sorted by week) | `MaterialsTab.jsx`, `StudentCourseView.jsx`, `pages/shared/MaterialDetail.jsx` (sibling list) |
| POST | `/api/courses/:courseId/materials` | ✱ | material fields | `Material` | `MaterialsTab.jsx` → add |
| GET | `/api/materials/:id` | • | — | `Material` | `pages/shared/MaterialDetail.jsx` |
| PATCH | `/api/materials/:id` | ✱ | partial | `Material` | `MaterialsTab.jsx` → edit |
| DELETE | `/api/materials/:id` | ✱ | — | `204` | `MaterialsTab.jsx` → delete |

### Quizzes — `modules/quizzes`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/courses/:courseId/quizzes` | • | — | `Quiz[]` (students: published, no `correctIndex`) | `QuizzesTab.jsx`, `StudentCourseView.jsx` |
| POST | `/api/courses/:courseId/quizzes` | ✱ | quiz + questions | `Quiz` | `QuizzesTab.jsx` → new |
| GET | `/api/quizzes/:id` | • | — | `Quiz` (sanitised for students) | quiz take/edit modals |
| PATCH | `/api/quizzes/:id` | ✱ | partial | `Quiz` | `QuizzesTab.jsx` → edit |
| DELETE | `/api/quizzes/:id` | ✱ | — | `204` (cascades attempts) | `QuizzesTab.jsx` → delete |
| GET | `/api/quizzes/:id/attempts` | ✱ | — | `QuizAttempt[]` (all students) | `QuizzesTab.jsx` (attempt count / avg) |
| GET | `/api/quizzes/:id/attempts/me` | ‡ | — | `QuizAttempt \| null` | `StudentCourseView.jsx` Quizzes tab |
| POST | `/api/quizzes/:id/attempts` | ‡ | `{ answers: { [questionId]: optionIndex } }` | `QuizAttempt` (**server grades it**) | student quiz modal → submit |

> **Server-side grading:** the client sends only `answers`. The service loads the
> quiz, computes `score = Σ points where answers[qId] === question.correctIndex`
> and `maxScore = Σ points`, rejects a second attempt with `409 CONFLICT`.

### Assignments & submissions — `modules/assignments`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/courses/:courseId/assignments` | • | — | `Assignment[]` (students: published) | `AssignmentsTab.jsx`, `StudentCourseView.jsx` |
| POST | `/api/courses/:courseId/assignments` | ✱ | assignment fields | `Assignment` | `AssignmentsTab.jsx` → new |
| GET | `/api/assignments/:id` | • | — | `Assignment` | — |
| PATCH | `/api/assignments/:id` | ✱ | partial | `Assignment` | `AssignmentsTab.jsx` → edit |
| DELETE | `/api/assignments/:id` | ✱ | — | `204` (cascades submissions) | `AssignmentsTab.jsx` → delete |
| GET | `/api/assignments/:id/submissions` | ✱ | — | `Submission[]` for the whole roster (missing rows synthesised as `status:"missing"`) | `AssignmentsTab.jsx` → Submissions modal |
| GET | `/api/assignments/:id/submissions/me` | ‡ | — | `Submission \| null` | `StudentCourseView.jsx` Assignments tab |
| POST | `/api/assignments/:id/submissions` | ‡ | `{ note, fileName, fileUrl? }` | `Submission` (upsert own, `status:"submitted"`) | student submit modal |
| PATCH | `/api/submissions/:id` | ✱ grade / ‡ own-if-ungraded | staff: `{ grade, feedback, status:"graded" }` · student: `{ note, fileName }` | `Submission` | `AssignmentsTab.jsx` GradePanel; student "update submission" |

### Attendance — `modules/attendance`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/courses/:courseId/attendance` | ✱ | — | `AttendanceSession[]` (full records) | `AttendanceTab.jsx` |
| POST | `/api/courses/:courseId/attendance` | ✱ | `{ date, topic, records }` | `AttendanceSession` | `AttendanceTab.jsx` → take attendance |
| PATCH | `/api/attendance/:id` | ✱ | partial | `AttendanceSession` | `AttendanceTab.jsx` → edit |
| DELETE | `/api/attendance/:id` | ✱ | — | `204` | `AttendanceTab.jsx` → delete |
| GET | `/api/courses/:courseId/attendance/me` | ‡ | — | `{ rate, present, total, sessions: [{ id, date, topic, status }] }` | `StudentCourseView.jsx` Attendance tab |

### Marks / Scoring (manual gradebook) — `modules/grades`

| Method | Path | Access | Body / query | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/courses/:courseId/grades` | ✱ | `?studentId=` | `Grade[]` | `GradesTab.jsx` (entries tab) |
| POST | `/api/courses/:courseId/grades` | ✱ | grade fields | `Grade` | `GradesTab.jsx` → add mark |
| PATCH | `/api/grades/:id` | ✱ | partial | `Grade` | `GradesTab.jsx` → edit |
| DELETE | `/api/grades/:id` | ✱ | — | `204` | `GradesTab.jsx` → delete |
| GET | `/api/courses/:courseId/grades/me` | ‡ | — | `Grade[]` | `StudentCourseView.jsx` Grades tab |

### Dashboards — `modules/dashboard`

| Method | Path | Access | Returns | Consumed by |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/dashboard` | ✱ | `{ counts: { courses, publishedCourses, students, activeStudents, awaitingGrading, sessions }, courses: [{ …course, studentCount }], recentSubmissions: [{ …submission, studentName, assignmentTitle }] }` | `pages/admin/AdminDashboard.jsx` |
| GET | `/api/me/dashboard` | ‡ | `{ courses: [{ …course, overall, attendanceRate }], pendingQuizzes, pendingAssignments, deadlines: [{ type, title, courseCode, due }], attendanceRate }` | `pages/student/StudentDashboard.jsx` |
| GET | `/api/me/grades` | ‡ | `{ gpa, average, gradedCount, courses: [{ …course, parts, overall, letter }] }` | `pages/student/StudentGrades.jsx` |

### Uploads (optional) — `modules/uploads`

| Method | Path | Access | Body | Returns | Consumed by |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/uploads` | • | `multipart/form-data` field `file` | `{ url, fileName, size, mime }` | material form (`url`), submission form (`fileName` + `fileUrl`) — replaces today's mock filename input |
| GET | `/uploads/:name` | public | — | the file | `MaterialViewer.jsx` (PDF/image/video), submission download link |

### Health

`GET /api/health` → `{ ok: true, time }` (no auth) — for uptime checks.

---

## 9. Front-end integration

The whole front end reads data through **one context** and there is exactly one
place to change: `src/context/DataContext.jsx` (and `AuthContext.jsx` for login).
Pages use `useData().db.<collection>` and `create/update/remove` — keep that API
and the pages don't change.

### 9.1 Add an API client — `src/lib/api.js`

```js
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const KEY = "qudrat-lms:token";

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = "GET", body, params } = {}) {
  const url = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Request failed"), { status: res.status, code: data?.error?.code });
  return data;
}
```

`.env` for the front end: `VITE_API_URL=http://localhost:4000/api`

### 9.2 `AuthContext` — swap mock login for the endpoint

```js
const login = async ({ email, password, expectedRole }) => {
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email, password } });
    if (expectedRole && user.role !== expectedRole) return { ok: false, error: "Wrong portal for this account." };
    setToken(token);
    setUser(user);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e.status === 401 ? "Email or password is incorrect." : e.message };
  }
};
// on mount: if getToken() → api("/auth/me").then(setUser).catch(() => setToken(null))
const logout = () => { setToken(null); setUser(null); };
```

### 9.3 `DataContext` — API-backed, minimal-change path (recommended for the POC)

Keep the `{ db, create, update, remove, removeWhere }` shape. After login, load
the collections the app needs into state; CRUD helpers call the API then patch
local state. Selectors in `src/lib/selectors.js` keep working untouched.

```js
export function DataProvider({ children }) {
  const { user } = useAuth();
  const [db, setDb] = useState(EMPTY);        // { users:[], courses:[], ... }
  const [loading, setLoading] = useState(true);

  // hydrate once per session
  useEffect(() => {
    if (!user) { setDb(EMPTY); return; }
    setLoading(true);
    Promise.all([
      api("/users"), api("/courses"), api("/enrollments"), /* … or per-course lazy loads */
    ]).then(([users, courses, enrollments]) => {
      setDb(d => ({ ...d, users, courses, enrollments }));
    }).finally(() => setLoading(false));
  }, [user]);

  const create = async (collection, item) => {
    const created = await api(ENDPOINT[collection].create(item), { method: "POST", body: item });
    setDb(d => ({ ...d, [collection]: [...d[collection], created] }));
    return created;
  };
  const update = async (collection, id, patch) => {
    const updated = await api(`${ENDPOINT[collection].base}/${id}`, { method: "PATCH", body: patch });
    setDb(d => ({ ...d, [collection]: d[collection].map(r => (r.id === id ? updated : r)) }));
  };
  const remove = async (collection, id) => {
    await api(`${ENDPOINT[collection].base}/${id}`, { method: "DELETE" });
    setDb(d => ({ ...d, [collection]: d[collection].filter(r => r.id !== id) }));
  };
  // removeWhere: keep client-side for the POC (server cascades already ran)

  return <DataContext.Provider value={{ db, loading, create, update, remove }}>{children}</DataContext.Provider>;
}
```

For nested resources (materials, quizzes, …) either lazy-load per course when a
workspace opens, or load everything on login for the POC's small dataset.

### 9.4 `DataContext` — react-query path (cleaner, more work)

Replace the god-context with `@tanstack/react-query` hooks per resource
(`useCourses()`, `useCourseMaterials(id)`, `useCreateMaterial()`, …). Better
caching, loading and error states, no manual state patching. Do this if the POC
graduates toward production; it touches every page.

### 9.5 "To and from" summary — data direction per screen

| Screen | Reads (GET) | Writes (POST/PATCH/DELETE) |
| --- | --- | --- |
| Login (`Login.jsx`) | `/auth/me` | `/auth/login` |
| Admin dashboard | `/admin/dashboard` | — |
| Admin Courses | `/courses`, `/users?role=admin` | `/courses` (C/U/D) |
| Course · Overview | `/courses/:id/summary` | — |
| Course · Materials | `/courses/:id/materials` | `/courses/:id/materials`, `/materials/:id` (C/U/D) |
| Course · Quizzes | `/courses/:id/quizzes`, `/quizzes/:id/attempts` | `/courses/:id/quizzes`, `/quizzes/:id` (C/U/D) |
| Course · Assignments | `/courses/:id/assignments`, `/assignments/:id/submissions` | assignments C/U/D; `PATCH /submissions/:id` (grade) |
| Course · Marks & Scoring | `/courses/:id/grades`, `/courses/:id/gradebook` | `/courses/:id/grades`, `/grades/:id` (C/U/D) |
| Course · Attendance | `/courses/:id/attendance` | attendance C/U/D |
| Course · Roster | `/courses/:id/roster`, `/users?role=student` | `/courses/:id/enrollments` (add), `…/enrollments/:sid` (remove) |
| Admin Students | `/users?role=student` | `/users` (C/U/D) |
| Student dashboard | `/me/dashboard` | — |
| Course Catalog | `/catalog` | `/courses/:id/enroll` (POST/DELETE) |
| My Courses | `/me/courses` | — |
| Student course · Materials | `/courses/:id/materials`, `/materials/:id` | — |
| Student course · Quizzes | `/courses/:id/quizzes`, `/quizzes/:id/attempts/me` | `/quizzes/:id/attempts` (submit) |
| Student course · Assignments | `/courses/:id/assignments`, `/assignments/:id/submissions/me` | `/assignments/:id/submissions`, `PATCH /submissions/:id` |
| Student course · Attendance | `/courses/:id/attendance/me` | — |
| Student course · Grades | `/courses/:id/grades/me` | — |
| My Grades | `/me/grades` | — |
| Material detail (`MaterialDetail.jsx`) | `/materials/:id`, `/courses/:id/materials` | — |

---

## 10. Reference implementation snippets

### `src/app.js`

```js
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { notFound, errorHandler } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";

import authRoutes from "./modules/auth/auth.routes.js";
import courseRoutes from "./modules/courses/courses.routes.js";
// … other module routers

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
  app.use(express.json());
  app.use(pinoHttp());

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api/auth", authRoutes);

  app.use("/api", requireAuth);          // everything below needs a token
  app.use("/api", courseRoutes);
  // … app.use("/api", materialRoutes) etc.
  app.use("/uploads", express.static(process.env.UPLOAD_DIR ?? "./uploads"));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

### `src/modules/courses/courses.service.js`

```js
import prisma from "../../lib/prisma.js";
import { serializeCourse } from "../../lib/serialize.js";

export async function list({ status, q }) {
  const rows = await prisma.course.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { instructor: true, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeCourse);
}

export async function create(input) {
  const row = await prisma.course.create({ data: input, include: { instructor: true } });
  return serializeCourse(row);
}

export async function remove(id) {
  await prisma.course.delete({ where: { id } });   // cascades via schema
}
```

### `src/modules/quizzes/quizzes.service.js` — grading

```js
export async function submitAttempt(quizId, studentId, answers) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw { status: 404, code: "NOT_FOUND" };

  const existing = await prisma.quizAttempt.findUnique({ where: { quizId_studentId: { quizId, studentId } } });
  if (existing) throw { status: 409, code: "CONFLICT", message: "Quiz already attempted" };

  const questions = quiz.questions;                       // JSON [{ id, correctIndex, points }]
  const maxScore = questions.reduce((s, q) => s + q.points, 0);
  const score = questions.reduce((s, q) => s + (answers[q.id] === q.correctIndex ? q.points : 0), 0);

  return prisma.quizAttempt.create({ data: { quizId, studentId, answers, score, maxScore } });
}
```

### `src/middleware/error.js`

```js
export const notFound = (_req, _res, next) => next({ status: 404, code: "NOT_FOUND" });

export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? 500;
  const code = err.code ?? (status === 500 ? "INTERNAL" : "ERROR");
  if (status === 500) console.error(err);
  res.status(status).json({ error: { code, message: err.message ?? code, details: err.details } });
}
```

---

## 11. Seeder — `prisma/seed.js`

Mirrors `src/data/seed.js` from the front end **field for field and id for id**,
so after `npm run db:seed` the API returns the same objects the SPA has been
showing. Demo passwords are hashed but unchanged (`admin123` / `student123`).

```js
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const iso = (d) => new Date(d);
const hash = (pw) => bcrypt.hashSync(pw, 10);

async function main() {
  // Order matters: clear children → parents
  await prisma.$transaction([
    prisma.quizAttempt.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.attendanceSession.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.material.deleteMany(),
    prisma.quiz.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── Users ────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      { id: "u-admin",   role: "admin",   name: "Dr. Farah Idris",        email: "admin@qudrat.edu", passwordHash: hash("admin123"),   title: "Academic Coordinator", avatarColor: "#B0591D" },
      { id: "u-instr-1", role: "admin",   name: "Nurse Educator Lim Wei", email: "lim@qudrat.edu",   passwordHash: hash("admin123"),   title: "Clinical Instructor",  avatarColor: "#8A4518" },
      { id: "s-1001", role: "student", name: "Aisyah Rahman",   email: "aisyah@student.qudrat.edu", passwordHash: hash("student123"), matric: "QN-2024-1001", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 12-334 5566", status: "active",   avatarColor: "#2563EB" },
      { id: "s-1002", role: "student", name: "Daniel Tan",      email: "daniel@student.qudrat.edu", passwordHash: hash("student123"), matric: "QN-2024-1002", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 13-889 1200", status: "active",   avatarColor: "#0D9488" },
      { id: "s-1003", role: "student", name: "Priya Nair",      email: "priya@student.qudrat.edu",  passwordHash: hash("student123"), matric: "QN-2024-1003", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 17-220 8841", status: "active",   avatarColor: "#7C3AED" },
      { id: "s-1004", role: "student", name: "Muhammad Haziq",  email: "haziq@student.qudrat.edu",  passwordHash: hash("student123"), matric: "QN-2024-1004", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 19-450 7723", status: "inactive", avatarColor: "#DC2626" },
    ],
  });

  // ── Courses ──────────────────────────────────────────
  await prisma.course.createMany({
    data: [
      { id: "c-anat",  code: "NUR 101", title: "Anatomy & Physiology I",   description: "Structure and function of the human body across major systems, with emphasis on clinical relevance for nursing practice.", instructorId: "u-admin",   credits: 4, schedule: "Mon & Wed, 09:00–10:30", room: "Block A — Lab 2",    term: "Semester 1, 2024", status: "published", createdAt: iso("2024-01-05") },
      { id: "c-fund",  code: "NUR 110", title: "Fundamentals of Nursing",  description: "Core nursing concepts: patient safety, hygiene, vital signs, documentation, and the nursing process.",                       instructorId: "u-instr-1", credits: 3, schedule: "Tue & Thu, 11:00–12:30", room: "Block B — Skills Lab", term: "Semester 1, 2024", status: "published", createdAt: iso("2024-01-05") },
      { id: "c-pharm", code: "NUR 205", title: "Pharmacology for Nurses",  description: "Drug classifications, safe medication administration, dosage calculation, and monitoring for adverse effects.",              instructorId: "u-admin",   credits: 3, schedule: "Fri, 09:00–12:00",       room: "Block A — Room 114",  term: "Semester 2, 2024", status: "draft",     createdAt: iso("2024-02-10") },
    ],
  });

  // ── Enrolments ───────────────────────────────────────
  await prisma.enrollment.createMany({
    data: [
      { id: "e-1", courseId: "c-anat", studentId: "s-1001", status: "enrolled", enrolledAt: iso("2024-01-08") },
      { id: "e-2", courseId: "c-anat", studentId: "s-1002", status: "enrolled", enrolledAt: iso("2024-01-08") },
      { id: "e-3", courseId: "c-anat", studentId: "s-1003", status: "enrolled", enrolledAt: iso("2024-01-09") },
      { id: "e-4", courseId: "c-fund", studentId: "s-1001", status: "enrolled", enrolledAt: iso("2024-01-08") },
      { id: "e-5", courseId: "c-fund", studentId: "s-1002", status: "enrolled", enrolledAt: iso("2024-01-10") },
    ],
  });

  // ── Materials (one of every viewer type) ─────────────
  await prisma.material.createMany({
    data: [
      { id: "m-1", courseId: "c-anat", week: 1, title: "Introduction to Anatomical Terminology", type: "reading", url: "https://en.wikipedia.org/wiki/Anatomical_terminology", description: "Planes, directional terms and body cavities. Read before the first lab.", createdAt: iso("2024-01-06") },
      { id: "m-2", courseId: "c-anat", week: 1, title: "Course Orientation — Lecture Slides",     type: "slides",  url: "https://pdfobject.com/pdf/sample.pdf",                     description: "How the course runs, assessment weighting and the lab schedule.",           createdAt: iso("2024-01-06") },
      { id: "m-3", courseId: "c-anat", week: 2, title: "Introduction to Anatomy & Physiology (Lecture Recording)", type: "video", url: "https://www.youtube.com/watch?v=uBGl2BujkPQ", description: "Levels of organisation, homeostasis and the anatomical position.", createdAt: iso("2024-01-13") },
      { id: "m-4", courseId: "c-anat", week: 2, title: "The Cardiovascular System — Handout",     type: "pdf",     url: "https://www.orimi.com/pdf-test.pdf",                       description: "Heart chambers, valves, the conduction pathway and the cardiac cycle.",     createdAt: iso("2024-01-15") },
      { id: "m-5", courseId: "c-anat", week: 3, title: "Anatomical Planes & Directional References", type: "image", url: "https://commons.wikimedia.org/wiki/Special:FilePath/Human_anatomy_planes,_labeled.jpg", description: "Reference diagram — sagittal, coronal and transverse planes.", createdAt: iso("2024-01-20") },
      { id: "m-6", courseId: "c-anat", week: 3, title: "Royal College of Nursing — Clinical Resources", type: "link", url: "https://www.rcn.org.uk/clinical-topics", description: "External reading for extra depth.", createdAt: iso("2024-01-20") },
      { id: "m-7", courseId: "c-fund", week: 1, title: "Measuring Vital Signs — Procedure Checklist", type: "pdf", url: "https://pdfobject.com/pdf/sample.pdf", description: "The checklist you will be assessed against in the skills lab.", createdAt: iso("2024-01-09") },
      { id: "m-8", courseId: "c-fund", week: 1, title: "Hand Hygiene Technique — Demonstration", type: "video", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", description: "Watch before your first practical. (Sample video file.)", createdAt: iso("2024-01-10") },
      { id: "m-9", courseId: "c-fund", week: 2, title: "Bed-making & Patient Positioning (Demonstration)", type: "video", url: "https://vimeo.com/22439234", description: "You'll practise this in the Week 2 skills session.", createdAt: iso("2024-01-16") },
    ],
  });

  // ── Quizzes (questions as JSON) ──────────────────────
  await prisma.quiz.create({
    data: {
      id: "q-1", courseId: "c-anat", title: "Quiz 1 — Anatomical Terminology",
      description: "Ten minutes. Covers directional terms and body planes.",
      dueDate: iso("2024-01-20"), published: true,
      questions: [
        { id: "q1-a", text: "Which term describes a position toward the head?", options: ["Superior", "Inferior", "Distal", "Ventral"], correctIndex: 0, points: 2 },
        { id: "q1-b", text: "The midsagittal plane divides the body into:", options: ["Anterior and posterior halves", "Equal left and right halves", "Superior and inferior parts", "Proximal and distal parts"], correctIndex: 1, points: 2 },
        { id: "q1-c", text: "The wrist is ____ to the elbow.", options: ["Proximal", "Medial", "Distal", "Superior"], correctIndex: 2, points: 2 },
      ],
    },
  });
  await prisma.quiz.create({
    data: {
      id: "q-2", courseId: "c-fund", title: "Quiz 1 — Vital Signs",
      description: "Normal ranges for an adult patient.",
      dueDate: iso("2024-01-25"), published: true,
      questions: [
        { id: "q2-a", text: "A normal resting adult heart rate is:", options: ["40–60 bpm", "60–100 bpm", "100–120 bpm", "120–140 bpm"], correctIndex: 1, points: 3 },
        { id: "q2-b", text: "Which reading indicates a fever?", options: ["36.5 °C", "37.0 °C", "37.4 °C", "38.2 °C"], correctIndex: 3, points: 3 },
      ],
    },
  });

  await prisma.quizAttempt.create({
    data: { id: "qa-1", quizId: "q-1", studentId: "s-1002", answers: { "q1-a": 0, "q1-b": 1, "q1-c": 0 }, score: 4, maxScore: 6, submittedAt: iso("2024-01-19T14:12:00") },
  });

  // ── Assignments + submissions ───────────────────────
  await prisma.assignment.createMany({
    data: [
      { id: "a-1", courseId: "c-anat", title: "Case Study: Tracing Blood Flow", description: "Write a 1-page explanation tracing a drop of blood from the right atrium to the aorta, naming every structure and valve.", dueDate: iso("2024-02-02"), maxPoints: 20, published: true },
      { id: "a-2", courseId: "c-fund", title: "Reflective Journal — First Skills Lab", description: "Reflect on your first hands-on session recording vital signs. 400–600 words.", dueDate: iso("2024-01-30"), maxPoints: 15, published: true },
    ],
  });
  await prisma.submission.createMany({
    data: [
      { id: "sub-1", assignmentId: "a-1", studentId: "s-1001", note: "Attached my case study. I included a diagram of the conduction pathway.", fileName: "aisyah-blood-flow.pdf", submittedAt: iso("2024-01-31T22:05:00"), status: "graded", grade: 18, feedback: "Excellent detail on the valves. Watch the spelling of 'tricuspid'.", gradedAt: iso("2024-02-03") },
      { id: "sub-2", assignmentId: "a-1", studentId: "s-1002", note: "Submitting a little early.", fileName: "daniel-blood-flow.docx", submittedAt: iso("2024-02-01T09:30:00"), status: "submitted" },
    ],
  });

  // ── Attendance (records as JSON) ────────────────────
  await prisma.attendanceSession.createMany({
    data: [
      { id: "att-1", courseId: "c-anat", date: iso("2024-01-08"), topic: "Orientation & anatomical terminology", records: { "s-1001": "present", "s-1002": "present", "s-1003": "late" } },
      { id: "att-2", courseId: "c-anat", date: iso("2024-01-10"), topic: "Body cavities and membranes",           records: { "s-1001": "present", "s-1002": "absent",  "s-1003": "present" } },
      { id: "att-3", courseId: "c-fund", date: iso("2024-01-09"), topic: "Introduction to the nursing process",   records: { "s-1001": "present", "s-1002": "present" } },
    ],
  });

  // ── Manual gradebook (marks / scoring) ──────────────
  await prisma.grade.createMany({
    data: [
      { id: "g-1", courseId: "c-anat", studentId: "s-1001", item: "Lab Practical 1", category: "Practical", score: 42, maxScore: 50, weight: 15, recordedAt: iso("2024-01-28") },
      { id: "g-2", courseId: "c-anat", studentId: "s-1002", item: "Lab Practical 1", category: "Practical", score: 37, maxScore: 50, weight: 15, recordedAt: iso("2024-01-28") },
      { id: "g-3", courseId: "c-fund", studentId: "s-1001", item: "Vital Signs Skills Check", category: "Practical", score: 9, maxScore: 10, weight: 10, recordedAt: iso("2024-01-22"), note: "Confident technique." },
    ],
  });

  console.log("Seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Run / reset:

```bash
npm run db:seed          # idempotent — wipes the tables above then re-inserts
npm run db:reset         # drop schema, re-migrate, then auto-runs the seed
```

> Keep this file and the front-end `src/data/seed.js` in sync until the SPA is
> fully API-backed and the mock seed can be deleted.

---

## 12. Testing the API

`api.http` (VS Code REST Client / IntelliJ):

```http
@base = http://localhost:4000/api

### login
# @name login
POST {{base}}/auth/login
Content-Type: application/json

{ "email": "admin@qudrat.edu", "password": "admin123" }

### list courses
GET {{base}}/courses
Authorization: Bearer {{login.response.body.token}}

### create a material
POST {{base}}/courses/c-anat/materials
Authorization: Bearer {{login.response.body.token}}
Content-Type: application/json

{ "title": "Skeletal System notes", "type": "pdf", "week": 4, "url": "https://pdfobject.com/pdf/sample.pdf" }

### student takes a quiz
POST {{base}}/quizzes/q-2/attempts
Authorization: Bearer {{studentLogin.response.body.token}}
Content-Type: application/json

{ "answers": { "q2-a": 1, "q2-b": 3 } }
```

Add a thin **Vitest + Supertest** suite for the money paths: login, RBAC (student
hitting an admin route → 403), quiz grading maths, cascade delete, "one attempt"
conflict.

---

## 13. Milestones

| # | Deliverable | Contents |
| --- | --- | --- |
| **M1 — Skeleton** (0.5 day) | App boots, DB migrates, seed runs | `app.js`, `server.js`, Prisma schema, `docker-compose`, `/health` |
| **M2 — Auth** (0.5 day) | Login works end to end | `/auth/login`, `/auth/me`, middleware, front-end `AuthContext` swap |
| **M3 — Core CRUD** (1.5 days) | Courses, users, materials, enrolments | modules + Zod + serialisers; front-end `DataContext` swap (§9.3) |
| **M4 — Assessments** (1.5 days) | Quizzes (+grading), assignments (+submissions +grading), attendance, marks | remaining modules; student course tabs live against the API |
| **M5 — Aggregates** (0.5 day) | Dashboards + gradebook + student grades | `/admin/dashboard`, `/me/dashboard`, `/me/grades`, `/courses/:id/gradebook` |
| **M6 — Polish** (0.5 day) | Uploads, error edges, seed refresh, deploy | `/uploads`, Vitest smoke, deploy to Render/Railway/Fly |

~6 working days for one backend developer to a demoable, deployed POC.

---

## 14. Deployment (POC)

- **DB:** managed Postgres (Render / Railway / Neon / Supabase free tier).
- **API:** Render Web Service or Railway — `npm start`, health check `/api/health`,
  run `prisma migrate deploy && node prisma/seed.js` on first deploy.
- **Env:** set `DATABASE_URL`, `JWT_SECRET` (strong), `CORS_ORIGIN` (the deployed
  SPA origin).
- **Front end:** set `VITE_API_URL` to the deployed API and rebuild.
- **Uploads:** local disk is ephemeral on these hosts — fine for a demo; move to
  S3 / Cloudflare R2 when it needs to persist.
