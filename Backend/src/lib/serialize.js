/**
 * DB row -> API shape.
 *
 * This is the front-end contract layer (BACKEND_PLAN.md §5.3). Two conveniences
 * matter most:
 *   - `Course.instructor` is flattened to the instructor's NAME STRING, with
 *     `instructorId` also present for the course-form dropdown.
 *   - `Submission` rows are synthesised with `status: "missing"` for roster
 *     members who never submitted.
 *
 * `passwordHash` must never leave this file.
 *
 * Date objects are returned as-is; Express's JSON serialiser renders them as
 * ISO-8601 strings, which is what §4 promises.
 */

/* ── Users ──────────────────────────────────────────────────────────── */

export function serializeUser(u) {
  if (!u) return null;
  const base = {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt,
  };
  if (u.role === "student") {
    return {
      ...base,
      matric: u.matric ?? "",
      cohort: u.cohort ?? "",
      phone: u.phone ?? "",
      status: u.status ?? "active",
    };
  }
  return { ...base, title: u.title ?? "" };
}

/* ── Courses ────────────────────────────────────────────────────────── */

export function serializeCourse(c) {
  if (!c) return null;
  const out = {
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    credits: c.credits,
    schedule: c.schedule,
    room: c.room,
    term: c.term,
    status: c.status,
    instructor: c.instructor?.name ?? "",
    instructorId: c.instructorId ?? null,
    createdAt: c.createdAt,
  };
  // Present only when the query asked for it (catalog, admin dashboard).
  if (c._count?.enrollments != null) out.enrolledCount = c._count.enrollments;
  return out;
}

/* ── Enrolments ─────────────────────────────────────────────────────── */

export const serializeEnrollment = (e) =>
  e && {
    id: e.id,
    courseId: e.courseId,
    studentId: e.studentId,
    status: e.status,
    enrolledAt: e.enrolledAt,
  };

/* ── Materials ──────────────────────────────────────────────────────── */

export const serializeMaterial = (m) =>
  m && {
    id: m.id,
    courseId: m.courseId,
    week: m.week,
    title: m.title,
    type: m.type,
    url: m.url,
    description: m.description,
    createdAt: m.createdAt,
  };

/* ── Quizzes ────────────────────────────────────────────────────────── */

export const serializeQuiz = (q) =>
  q && {
    id: q.id,
    courseId: q.courseId,
    title: q.title,
    description: q.description,
    dueDate: q.dueDate,
    published: q.published,
    questions: Array.isArray(q.questions) ? q.questions : [],
    createdAt: q.createdAt,
  };

/** Strip the answer key for students; admins get the full question objects. */
export function quizForRole(q, role) {
  const quiz = serializeQuiz(q);
  if (!quiz || role === "admin") return quiz;
  return {
    ...quiz,
    questions: quiz.questions.map(({ correctIndex, ...rest }) => rest),
  };
}

export const serializeAttempt = (a) =>
  a && {
    id: a.id,
    quizId: a.quizId,
    studentId: a.studentId,
    answers: a.answers ?? {},
    score: a.score,
    maxScore: a.maxScore,
    submittedAt: a.submittedAt,
  };

/* ── Assignments & submissions ──────────────────────────────────────── */

export const serializeAssignment = (a) =>
  a && {
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    description: a.description,
    dueDate: a.dueDate,
    maxPoints: a.maxPoints,
    published: a.published,
    createdAt: a.createdAt,
  };

export const serializeSubmission = (s) =>
  s && {
    id: s.id,
    assignmentId: s.assignmentId,
    studentId: s.studentId,
    note: s.note,
    fileName: s.fileName,
    fileUrl: s.fileUrl,
    submittedAt: s.submittedAt,
    status: s.status,
    grade: s.grade ?? null,
    feedback: s.feedback,
    gradedAt: s.gradedAt ?? null,
  };

/** A roster member with no submission row — the front end renders this as "missing". */
export const missingSubmission = (assignmentId, studentId) => ({
  id: `missing:${assignmentId}:${studentId}`,
  assignmentId,
  studentId,
  note: "",
  fileName: "",
  fileUrl: "",
  submittedAt: null,
  status: "missing",
  grade: null,
  feedback: "",
  gradedAt: null,
});

/* ── Attendance ─────────────────────────────────────────────────────── */

export const serializeAttendance = (s) =>
  s && {
    id: s.id,
    courseId: s.courseId,
    date: s.date,
    topic: s.topic,
    records: s.records ?? {},
  };

/**
 * Same shape, but `records` holds only the asking student's own key so a student
 * never receives a classmate's attendance status.
 */
export function attendanceForStudent(s, studentId) {
  const session = serializeAttendance(s);
  if (!session) return null;
  const own = session.records?.[studentId];
  return { ...session, records: own ? { [studentId]: own } : {} };
}

/* ── Marks / scoring ────────────────────────────────────────────────── */

export const serializeGrade = (g) =>
  g && {
    id: g.id,
    courseId: g.courseId,
    studentId: g.studentId,
    item: g.item,
    category: g.category,
    score: g.score,
    maxScore: g.maxScore,
    weight: g.weight,
    note: g.note,
    recordedAt: g.recordedAt,
  };
