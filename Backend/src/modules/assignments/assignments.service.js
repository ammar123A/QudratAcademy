import prisma from "../../lib/prisma.js";
import { missingSubmission, serializeAssignment, serializeSubmission } from "../../lib/serialize.js";
import {
  assertCourseAccess,
  enrolledCourseIds,
  notFound,
  rosterStudentIds,
} from "../../lib/scope.js";

/** Flat list — students get published assignments of enrolled courses. */
export async function list(user, { courseId } = {}) {
  let where = courseId ? { courseId } : {};
  if (user.role !== "admin") {
    const ids = await enrolledCourseIds(user.id);
    const scoped = courseId ? (ids.includes(courseId) ? [courseId] : []) : ids;
    where = { courseId: { in: scoped }, published: true };
  }
  const rows = await prisma.assignment.findMany({ where, orderBy: { createdAt: "asc" } });
  return rows.map(serializeAssignment);
}

export async function listForCourse(user, courseId) {
  await assertCourseAccess(user, courseId);
  const rows = await prisma.assignment.findMany({
    where: { courseId, ...(user.role === "admin" ? {} : { published: true }) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeAssignment);
}

export async function get(user, id) {
  const row = await prisma.assignment.findUnique({ where: { id } });
  if (!row) throw notFound("Assignment not found");
  await assertCourseAccess(user, row.courseId);
  if (user.role !== "admin" && !row.published) throw notFound("Assignment not found");
  return serializeAssignment(row);
}

export async function create(courseId, input) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");
  const row = await prisma.assignment.create({ data: { ...input, courseId } });
  return serializeAssignment(row);
}

export async function update(id, input) {
  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw notFound("Assignment not found");
  const row = await prisma.assignment.update({ where: { id }, data: input });
  return serializeAssignment(row);
}

/** Cascades submissions. */
export async function remove(id) {
  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw notFound("Assignment not found");
  await prisma.assignment.delete({ where: { id } });
}

/* ── Submissions ────────────────────────────────────────────────────── */

/** Flat list — students see only their own submissions. */
export async function listSubmissions(user, { assignmentId, studentId } = {}) {
  const rows = await prisma.submission.findMany({
    where: {
      ...(assignmentId ? { assignmentId } : {}),
      ...(user.role === "admin" ? (studentId ? { studentId } : {}) : { studentId: user.id }),
    },
    orderBy: { submittedAt: "asc" },
  });
  return rows.map(serializeSubmission);
}

/**
 * The grading view: every roster member appears, so students who never handed
 * anything in get a synthesised `status: "missing"` row.
 */
export async function submissionsForAssignment(assignmentId) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw notFound("Assignment not found");

  const [studentIds, rows] = await Promise.all([
    rosterStudentIds(assignment.courseId),
    prisma.submission.findMany({ where: { assignmentId } }),
  ]);

  const byStudent = new Map(rows.map((r) => [r.studentId, r]));
  return studentIds.map((studentId) =>
    byStudent.has(studentId)
      ? serializeSubmission(byStudent.get(studentId))
      : missingSubmission(assignmentId, studentId),
  );
}

export async function mySubmission(assignmentId, studentId) {
  const row = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });
  return row ? serializeSubmission(row) : null;
}

/** Student hand-in. Upserts their own row; a graded submission is locked. */
export async function submit(assignmentId, studentId, input) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw notFound("Assignment not found");
  if (!assignment.published) {
    throw { status: 403, code: "FORBIDDEN", message: "Assignment is not published" };
  }

  const enrolled = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId: assignment.courseId, studentId } },
  });
  if (!enrolled || enrolled.status !== "enrolled") {
    throw { status: 403, code: "FORBIDDEN", message: "Not enrolled in this course" };
  }

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });
  if (existing?.status === "graded") {
    throw { status: 403, code: "FORBIDDEN", message: "This submission has been graded already" };
  }

  const data = {
    note: input.note ?? "",
    fileName: input.fileName ?? "",
    fileUrl: input.fileUrl ?? "",
    submittedAt: new Date(),
    status: "submitted",
  };

  const row = await prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    update: data,
    create: { assignmentId, studentId, ...data },
  });
  return serializeSubmission(row);
}

/**
 * Dual-mode patch (§8):
 *   staff   -> { grade, feedback, status: "graded" }
 *   student -> { note, fileName } on their OWN row, only while not graded
 */
export async function patchSubmission(user, id, input) {
  const existing = await prisma.submission.findUnique({ where: { id } });
  if (!existing) throw notFound("Submission not found");

  if (user.role === "admin") {
    const data = {};
    if (input.grade !== undefined) data.grade = input.grade;
    if (input.feedback !== undefined) data.feedback = input.feedback;
    if (input.status !== undefined) data.status = input.status;
    if (data.status === "graded" || data.grade != null) {
      data.status = "graded";
      data.gradedAt = new Date();
    }
    const row = await prisma.submission.update({ where: { id }, data });
    return serializeSubmission(row);
  }

  if (existing.studentId !== user.id) {
    throw { status: 403, code: "FORBIDDEN", message: "Not your submission" };
  }
  if (existing.status === "graded") {
    throw { status: 403, code: "FORBIDDEN", message: "This submission has been graded already" };
  }

  const data = {};
  if (input.note !== undefined) data.note = input.note;
  if (input.fileName !== undefined) data.fileName = input.fileName;
  if (input.fileUrl !== undefined) data.fileUrl = input.fileUrl;
  data.submittedAt = new Date();

  const row = await prisma.submission.update({ where: { id }, data });
  return serializeSubmission(row);
}
