import prisma from "../../lib/prisma.js";
import { quizForRole, serializeAttempt } from "../../lib/serialize.js";
import { assertCourseAccess, conflict, enrolledCourseIds, notFound } from "../../lib/scope.js";

/** Flat list — students get published quizzes of enrolled courses, answer key stripped. */
export async function list(user, { courseId } = {}) {
  let where = courseId ? { courseId } : {};
  if (user.role !== "admin") {
    const ids = await enrolledCourseIds(user.id);
    const scoped = courseId ? (ids.includes(courseId) ? [courseId] : []) : ids;
    where = { courseId: { in: scoped }, published: true };
  }
  const rows = await prisma.quiz.findMany({ where, orderBy: { createdAt: "asc" } });
  return rows.map((q) => quizForRole(q, user.role));
}

export async function listForCourse(user, courseId) {
  await assertCourseAccess(user, courseId);
  const rows = await prisma.quiz.findMany({
    where: { courseId, ...(user.role === "admin" ? {} : { published: true }) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((q) => quizForRole(q, user.role));
}

export async function get(user, id) {
  const row = await prisma.quiz.findUnique({ where: { id } });
  if (!row) throw notFound("Quiz not found");
  await assertCourseAccess(user, row.courseId);
  if (user.role !== "admin" && !row.published) throw notFound("Quiz not found");
  return quizForRole(row, user.role);
}

export async function create(courseId, input) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");
  const row = await prisma.quiz.create({ data: { ...input, courseId } });
  return quizForRole(row, "admin");
}

export async function update(id, input) {
  const existing = await prisma.quiz.findUnique({ where: { id } });
  if (!existing) throw notFound("Quiz not found");
  const row = await prisma.quiz.update({ where: { id }, data: input });
  return quizForRole(row, "admin");
}

/** Cascades attempts. */
export async function remove(id) {
  const existing = await prisma.quiz.findUnique({ where: { id } });
  if (!existing) throw notFound("Quiz not found");
  await prisma.quiz.delete({ where: { id } });
}

/* ── Attempts ───────────────────────────────────────────────────────── */

/** Flat list of attempts — students see only their own. */
export async function listAttempts(user, { quizId, studentId } = {}) {
  const rows = await prisma.quizAttempt.findMany({
    where: {
      ...(quizId ? { quizId } : {}),
      ...(user.role === "admin" ? (studentId ? { studentId } : {}) : { studentId: user.id }),
    },
    orderBy: { submittedAt: "asc" },
  });
  return rows.map(serializeAttempt);
}

export async function attemptsForQuiz(quizId) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw notFound("Quiz not found");
  const rows = await prisma.quizAttempt.findMany({
    where: { quizId },
    orderBy: { submittedAt: "asc" },
  });
  return rows.map(serializeAttempt);
}

export async function myAttempt(quizId, studentId) {
  const row = await prisma.quizAttempt.findUnique({
    where: { quizId_studentId: { quizId, studentId } },
  });
  return row ? serializeAttempt(row) : null;
}

/**
 * Server-side grading (§8). The client sends only `answers`; the score is
 * computed here from the stored answer key so it can't be forged. One attempt
 * per student is the POC rule — a second try is a 409.
 */
export async function submitAttempt(quizId, studentId, answers) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw notFound("Quiz not found");
  if (!quiz.published) throw { status: 403, code: "FORBIDDEN", message: "Quiz is not published" };

  const enrolled = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId: quiz.courseId, studentId } },
  });
  if (!enrolled || enrolled.status !== "enrolled") {
    throw { status: 403, code: "FORBIDDEN", message: "Not enrolled in this course" };
  }

  const existing = await prisma.quizAttempt.findUnique({
    where: { quizId_studentId: { quizId, studentId } },
  });
  if (existing) throw conflict("Quiz already attempted");

  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const maxScore = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const score = questions.reduce(
    (s, q) => s + (answers[q.id] === q.correctIndex ? (q.points ?? 0) : 0),
    0,
  );

  const row = await prisma.quizAttempt.create({
    data: { quizId, studentId, answers, score, maxScore },
  });
  return serializeAttempt(row);
}
