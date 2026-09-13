# Connecting the SPA to the Qudrat API

For the front-end side of Qudrat. The API is live at `http://localhost:4000/api` and
seeded with the **same demo data the SPA already shows** — same ids (`c-anat`, `s-1001`,
`m-1`…`m-9`), same names, same passwords (`admin123` / `student123`). So if the swap
below works, the screens should look identical to what they look like now.

There are two files to change: `AuthContext.jsx` and `DataContext.jsx`. Pages don't change.

---

## 1. Environment

Add to the SPA's `.env`:

```ini
VITE_API_URL=http://localhost:4000/api
```

The API already allows `http://localhost:5173` via CORS. On a different port, tell the
backend side to add it to `CORS_ORIGIN`.

---

## 2. `src/lib/api.js` — new file

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
  if (!res.ok) {
    throw Object.assign(new Error(data?.error?.message || "Request failed"), {
      status: res.status,
      code: data?.error?.code,
    });
  }
  return data;
}
```

Every error comes back in one shape, so one `catch` handles all of them:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "path": "title", "message": "…" } ] } }
```

Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND`
(404), `CONFLICT` (409), `INTERNAL` (500).

---

## 3. `AuthContext.jsx` — swap the mock login

```js
const login = async ({ email, password, expectedRole }) => {
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email, password } });
    if (expectedRole && user.role !== expectedRole) {
      return { ok: false, error: "Wrong portal for this account." };
    }
    setToken(token);
    setUser(user);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e.status === 401 ? "Email or password is incorrect." : e.message };
  }
};

// on mount: rehydrate the session from a stored token
useEffect(() => {
  if (!getToken()) return setReady(true);
  api("/auth/me")
    .then(setUser)
    .catch(() => setToken(null))
    .finally(() => setReady(true));
}, []);

const logout = () => { setToken(null); setUser(null); };
```

The token is a JWT valid for 7 days. Anything expired or tampered with comes back as
`401 UNAUTHENTICATED` — treat that as "log out and show the login screen".

Two notes on the user object:

- `role` is `"admin"` or `"student"`. Staff have `title`; students have `matric`, `cohort`,
  `phone`, `status`.
- `password` is write-only. It's accepted on create/update and never returned.

---

## 4. `DataContext.jsx` — keep the shape, change the source

The API has **flat, role-scoped collection endpoints** precisely so this file can keep its
`{ db, create, update, remove }` shape. Each one filters itself by who's asking: an admin
gets everything, a student gets only their own rows (their enrolments, their submissions,
their marks, their attendance — with classmates' records stripped server-side). So the
same hydration code works for both portals and `src/lib/selectors.js` keeps working
untouched.

```js
const COLLECTIONS = {
  users:        "/users",
  courses:      "/courses",
  enrollments:  "/enrollments",
  materials:    "/materials",
  quizzes:      "/quizzes",
  quizAttempts: "/quiz-attempts",
  assignments:  "/assignments",
  submissions:  "/submissions",
  attendance:   "/attendance",
  grades:       "/grades",
};

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [db, setDb] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setDb(EMPTY); setLoading(false); return; }
    setLoading(true);
    const keys = Object.keys(COLLECTIONS);
    Promise.all(keys.map((k) => api(COLLECTIONS[k])))
      .then((results) => {
        setDb(Object.fromEntries(keys.map((k, i) => [k, results[i]])));
      })
      .finally(() => setLoading(false));
  }, [user]);
  // …
}
```

### Writes

Creates are nested under their parent, so `create` needs the parent id. Updates and
deletes are flat by resource id:

| Collection | Create | Update / Delete |
| --- | --- | --- |
| `users` | `POST /users` | `/users/:id` |
| `courses` | `POST /courses` | `/courses/:id` |
| `materials` | `POST /courses/:courseId/materials` | `/materials/:id` |
| `quizzes` | `POST /courses/:courseId/quizzes` | `/quizzes/:id` |
| `assignments` | `POST /courses/:courseId/assignments` | `/assignments/:id` |
| `attendance` | `POST /courses/:courseId/attendance` | `/attendance/:id` |
| `grades` | `POST /courses/:courseId/grades` | `/grades/:id` |

```js
const CREATE_PATH = {
  users: () => "/users",
  courses: () => "/courses",
  materials: (m) => `/courses/${m.courseId}/materials`,
  quizzes: (q) => `/courses/${q.courseId}/quizzes`,
  assignments: (a) => `/courses/${a.courseId}/assignments`,
  attendance: (s) => `/courses/${s.courseId}/attendance`,
  grades: (g) => `/courses/${g.courseId}/grades`,
};

const BASE_PATH = {
  users: "/users", courses: "/courses", materials: "/materials",
  quizzes: "/quizzes", assignments: "/assignments",
  attendance: "/attendance", grades: "/grades", submissions: "/submissions",
};

const create = async (collection, item) => {
  const created = await api(CREATE_PATH[collection](item), { method: "POST", body: item });
  setDb((d) => ({ ...d, [collection]: [...d[collection], created] }));
  return created;
};

const update = async (collection, id, patch) => {
  const updated = await api(`${BASE_PATH[collection]}/${id}`, { method: "PATCH", body: patch });
  setDb((d) => ({ ...d, [collection]: d[collection].map((r) => (r.id === id ? updated : r)) }));
  return updated;
};

const remove = async (collection, id) => {
  await api(`${BASE_PATH[collection]}/${id}`, { method: "DELETE" });
  setDb((d) => ({ ...d, [collection]: d[collection].filter((r) => r.id !== id) }));
};
```

`removeWhere` can stay client-side: the server already cascaded. Deleting a course wipes
its enrolments, materials, quizzes, assignments, attendance and marks in the database, so
the local prune is only keeping the UI honest until the next reload.

---

## 5. Five things the server does that the mock didn't

These are the behaviours worth knowing before you wire the screens up — each one replaces
logic the SPA may be doing locally today.

**1. Quizzes are graded on the server.** Post only the answers; don't compute a score.

```js
await api(`/quizzes/${quizId}/attempts`, {
  method: "POST",
  body: { answers: { "q2-a": 1, "q2-b": 3 } },  // { [questionId]: optionIndex }
});
// -> { id, quizId, studentId, answers, score, maxScore, submittedAt }
```

A score sent from the client is ignored. One attempt per student is the rule — a second
`POST` returns **409 CONFLICT**, which is the signal to show "already attempted".

**2. Students never receive `correctIndex`.** `GET /quizzes` and `GET /quizzes/:id` strip
the answer key from every question for a student token. Don't build a "review answers"
screen expecting it — if students need to see correct answers after submitting, ask for a
dedicated endpoint.

**3. `GET /assignments/:id/submissions` returns the whole roster.** Students who never
submitted appear as synthesised rows with `status: "missing"` and `id:
"missing:<assignmentId>:<studentId>"`. Those ids are **not real records** — don't PATCH
them. `status` is `"submitted" | "graded" | "missing"`.

**4. A graded submission is locked.** A student PATCHing their own submission after it's
graded gets **403**. Hide the "update submission" button once `status === "graded"`.

**5. `Course.instructor` is a name string.** `instructorId` is the FK for the dropdown;
`instructor` is the resolved name for display. Both are present on every course object.

---

## 6. Aggregate endpoints — cheaper than computing in the client

The dashboards and grade views are one request each, already computed with the same
weighting `selectors.js` uses (manual marks keep their own weight, graded assignments
weight 10, quizzes weight 5):

| Screen | Endpoint | Returns |
| --- | --- | --- |
| `AdminDashboard.jsx` | `GET /admin/dashboard` | `{ counts: { courses, publishedCourses, students, activeStudents, awaitingGrading, sessions }, courses: [{ …course, studentCount }], recentSubmissions: [{ …submission, studentName, assignmentTitle }] }` |
| `StudentDashboard.jsx` | `GET /me/dashboard` | `{ courses: [{ …course, overall, attendanceRate }], pendingQuizzes, pendingAssignments, deadlines: [{ type, title, courseCode, due }], attendanceRate }` |
| `StudentGrades.jsx` | `GET /me/grades` | `{ gpa, average, gradedCount, courses: [{ …course, parts, totalWeight, overall, letter }] }` |
| `course/GradesTab.jsx` | `GET /courses/:id/gradebook` | `[{ student, parts, totalWeight, overall, letter }]` |
| `course/Overview.jsx` | `GET /courses/:id/summary` | `{ studentCount, materialCount, quizCount, assignmentCount, sessionCount }` |
| `course/RosterTab.jsx` | `GET /courses/:id/roster` | `[{ student, enrollment }]` |
| `CourseCatalog.jsx` | `GET /catalog` | published courses + `{ enrolledCount, isEnrolled }` |
| `StudentCourseView.jsx` attendance tab | `GET /courses/:id/attendance/me` | `{ rate, present, total, sessions: [{ id, date, topic, status }] }` |

**Sanity check when you wire it up:** log in as `aisyah@student.qudrat.edu` and open My
Grades. **NUR 101 must read overall 86, letter A.** That's `g-1` (42/50 = 84% at weight 15)
plus `sub-1` (18/20 = 90% at weight 10) → `round((84·15 + 90·10) / 25)`. If you see 86, the
formula matches on both sides. If you see something else, the two grade formulas have
drifted and it's worth a message before building on top of it.

---

## 7. Per-screen reference

| Screen | Reads | Writes |
| --- | --- | --- |
| Login | `/auth/me` | `/auth/login` |
| Admin dashboard | `/admin/dashboard` | — |
| Admin Courses | `/courses`, `/users?role=admin` | `/courses` (C/U/D) |
| Course · Overview | `/courses/:id/summary` | — |
| Course · Materials | `/courses/:id/materials` | `/courses/:id/materials`, `/materials/:id` |
| Course · Quizzes | `/courses/:id/quizzes`, `/quizzes/:id/attempts` | `/courses/:id/quizzes`, `/quizzes/:id` |
| Course · Assignments | `/courses/:id/assignments`, `/assignments/:id/submissions` | assignments C/U/D, `PATCH /submissions/:id` |
| Course · Marks & Scoring | `/courses/:id/grades`, `/courses/:id/gradebook` | `/courses/:id/grades`, `/grades/:id` |
| Course · Attendance | `/courses/:id/attendance` | attendance C/U/D |
| Course · Roster | `/courses/:id/roster`, `/users?role=student` | `/courses/:id/enrollments`, `…/enrollments/:sid` |
| Admin Students | `/users?role=student` | `/users` (C/U/D) |
| Student dashboard | `/me/dashboard` | — |
| Course Catalog | `/catalog` | `POST`/`DELETE /courses/:id/enroll` |
| My Courses | `/me/courses` | — |
| Student course · Materials | `/courses/:id/materials`, `/materials/:id` | — |
| Student course · Quizzes | `/courses/:id/quizzes`, `/quizzes/:id/attempts/me` | `/quizzes/:id/attempts` |
| Student course · Assignments | `/courses/:id/assignments`, `/assignments/:id/submissions/me` | `/assignments/:id/submissions`, `PATCH /submissions/:id` |
| Student course · Attendance | `/courses/:id/attendance/me` | — |
| Student course · Grades | `/courses/:id/grades/me` | — |
| My Grades | `/me/grades` | — |
| Material detail | `/materials/:id`, `/courses/:id/materials` | — |

---

## 8. File uploads (optional)

If you want real files instead of a typed filename:

```js
const form = new FormData();
form.append("file", file);
const res = await fetch(`${BASE}/uploads`, {
  method: "POST",
  headers: { Authorization: `Bearer ${getToken()}` },  // no Content-Type — the browser sets the boundary
  body: form,
});
const { url, fileName, size, mime } = await res.json();
```

Put `url` into a material's `url`, or a submission's `fileUrl` with `fileName`. Files are
served from `http://localhost:4000/uploads/<name>`. 25 MB cap. Local disk, so on a
deployed host they vanish on restart — fine for a demo, not for real coursework.

---

## 9. Conventions

- Collections return a **bare array**; single resources return the **object**.
- Dates are ISO-8601 strings both ways (`2024-01-20T00:00:00.000Z`).
- Deletes return **204** with no body.
- Everything except `POST /auth/login` and `GET /api/health` needs
  `Authorization: Bearer <token>`.
- `api.http` in this folder has a runnable request for every endpoint, including the
  negative cases (401/403/404/400/409) — useful for checking what an error looks like
  before you write the handler.
