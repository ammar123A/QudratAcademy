# Qudrat LMS — Backend API

Node + Express + Prisma + PostgreSQL REST API for the Qudrat nursing LMS proof of concept.

- **Build brief:** [BACKEND_PLAN.md](BACKEND_PLAN.md) — the full spec this implements.
- **Front-end handoff:** [INTEGRATION.md](INTEGRATION.md) — how the SPA connects.
- **Manual tests:** [api.http](api.http) — a runnable request per endpoint.

## Run it

```bash
npm install
cp .env.example .env          # then set DATABASE_URL if your Postgres differs
npm run db:migrate            # create the tables
npm run db:seed               # load the demo data
npm run dev                   # http://localhost:4000/api
```

Check it's up: `curl http://localhost:4000/api/health`

### Database

`.env` expects a local PostgreSQL with a `qudrat` role and a `qudrat_lms` database:

```sql
CREATE ROLE qudrat LOGIN PASSWORD 'qudrat';
CREATE DATABASE qudrat_lms OWNER qudrat;
```

No local Postgres? `npm run db:up` starts one in Docker on **port 5433**, then point
`DATABASE_URL` at `localhost:5433`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@qudrat.edu` | `admin123` |
| Instructor (staff) | `lim@qudrat.edu` | `admin123` |
| Student | `aisyah@student.qudrat.edu` | `student123` |

Also `daniel@`, `priya@`, `haziq@` (inactive), all `student123`.

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | watch mode on port 4000 |
| `npm start` | production start |
| `npm run db:migrate` | create/apply migrations |
| `npm run db:seed` | load demo data (idempotent — wipes then re-inserts) |
| `npm run db:reset` | drop, re-migrate, re-seed |
| `npm run db:studio` | Prisma Studio, a GUI over the data |
| `npm test` | Vitest suite (needs a running database) |

## Layout

```
prisma/schema.prisma    data model (10 models)
prisma/seed.js          demo data, ids matched to the front-end mock
src/app.js              express app, middleware, route mounting
src/server.js           boot
src/lib/grades.js       the weighted-grade formula (§7) — must match the SPA's selectors.js
src/lib/serialize.js    DB row -> API shape; strips passwordHash and quiz answer keys
src/lib/scope.js        role/ownership guards shared by services
src/middleware/         auth (JWT + roles), zod validation, error handler
src/modules/<name>/     routes -> controller -> service, one folder per resource
tests/                  login, RBAC, quiz grading, cascades, error shapes
```

## Notes

- Auth is a 7-day JWT. Passwords are bcrypt (10 rounds).
- Writes are staff-only; students are restricted to their own data, enforced in the
  service layer rather than at the route, so flat collection endpoints can safely return
  a filtered view instead of 403 (see [INTEGRATION.md](INTEGRATION.md) §4).
- Quizzes are graded server-side; `correctIndex` never reaches a student.
- Deletes cascade in the database — removing a course or student cleans up everything
  hanging off it.
- Out of scope for the POC: email/notifications, audit logs, rate limiting,
  refresh-token rotation, S3-grade file storage.
