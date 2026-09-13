import prisma from "../../lib/prisma.js";
import { serializeGrade } from "../../lib/serialize.js";
import { assertCourseAccess, enrolledCourseIds, notFound } from "../../lib/scope.js";

const order = { recordedAt: "asc" };

/** Flat list — a student sees only their own marks. */
export async function list(user, { courseId, studentId } = {}) {
  if (user.role === "admin") {
    const rows = await prisma.grade.findMany({
      where: { ...(courseId ? { courseId } : {}), ...(studentId ? { studentId } : {}) },
      orderBy: order,
    });
    return rows.map(serializeGrade);
  }

  const ids = await enrolledCourseIds(user.id);
  const scoped = courseId ? (ids.includes(courseId) ? [courseId] : []) : ids;
  const rows = await prisma.grade.findMany({
    where: { studentId: user.id, courseId: { in: scoped } },
    orderBy: order,
  });
  return rows.map(serializeGrade);
}

export async function listForCourse(courseId, studentId) {
  const rows = await prisma.grade.findMany({
    where: { courseId, ...(studentId ? { studentId } : {}) },
    orderBy: order,
  });
  return rows.map(serializeGrade);
}

export async function myGradesForCourse(user, courseId) {
  await assertCourseAccess(user, courseId);
  const rows = await prisma.grade.findMany({
    where: { courseId, studentId: user.id },
    orderBy: order,
  });
  return rows.map(serializeGrade);
}

export async function create(courseId, input) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");
  const student = await prisma.user.findUnique({ where: { id: input.studentId } });
  if (!student) throw notFound("Student not found");

  const row = await prisma.grade.create({ data: { ...input, courseId } });
  return serializeGrade(row);
}

export async function update(id, input) {
  const existing = await prisma.grade.findUnique({ where: { id } });
  if (!existing) throw notFound("Mark not found");
  const row = await prisma.grade.update({ where: { id }, data: input });
  return serializeGrade(row);
}

export async function remove(id) {
  const existing = await prisma.grade.findUnique({ where: { id } });
  if (!existing) throw notFound("Mark not found");
  await prisma.grade.delete({ where: { id } });
}
