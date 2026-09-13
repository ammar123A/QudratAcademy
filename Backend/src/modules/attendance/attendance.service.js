import prisma from "../../lib/prisma.js";
import { attendanceForStudent, serializeAttendance } from "../../lib/serialize.js";
import { attendanceSummary } from "../../lib/grades.js";
import { assertCourseAccess, enrolledCourseIds, notFound } from "../../lib/scope.js";

const byDate = { date: "asc" };

/**
 * Flat list. For a student, `records` is narrowed to their own key only — the
 * rest of the class's attendance never leaves the server.
 */
export async function list(user, { courseId } = {}) {
  if (user.role === "admin") {
    const rows = await prisma.attendanceSession.findMany({
      where: courseId ? { courseId } : {},
      orderBy: byDate,
    });
    return rows.map(serializeAttendance);
  }

  const ids = await enrolledCourseIds(user.id);
  const scoped = courseId ? (ids.includes(courseId) ? [courseId] : []) : ids;
  const rows = await prisma.attendanceSession.findMany({
    where: { courseId: { in: scoped } },
    orderBy: byDate,
  });
  return rows.map((s) => attendanceForStudent(s, user.id));
}

export async function listForCourse(courseId) {
  const rows = await prisma.attendanceSession.findMany({ where: { courseId }, orderBy: byDate });
  return rows.map(serializeAttendance);
}

export async function create(courseId, input) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");
  const row = await prisma.attendanceSession.create({ data: { ...input, courseId } });
  return serializeAttendance(row);
}

export async function update(id, input) {
  const existing = await prisma.attendanceSession.findUnique({ where: { id } });
  if (!existing) throw notFound("Attendance session not found");
  const row = await prisma.attendanceSession.update({ where: { id }, data: input });
  return serializeAttendance(row);
}

export async function remove(id) {
  const existing = await prisma.attendanceSession.findUnique({ where: { id } });
  if (!existing) throw notFound("Attendance session not found");
  await prisma.attendanceSession.delete({ where: { id } });
}

/** The student's own attendance for one course: rate + per-session status. */
export async function mySummary(user, courseId) {
  await assertCourseAccess(user, courseId);
  const sessions = await prisma.attendanceSession.findMany({
    where: { courseId },
    orderBy: byDate,
  });
  return attendanceSummary(sessions, user.id);
}
