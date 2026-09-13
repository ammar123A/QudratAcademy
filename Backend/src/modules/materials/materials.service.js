import prisma from "../../lib/prisma.js";
import { serializeMaterial } from "../../lib/serialize.js";
import { assertCourseAccess, enrolledCourseIds, notFound } from "../../lib/scope.js";

const byWeek = [{ week: "asc" }, { createdAt: "asc" }];

/** Flat list — a student sees materials of the courses they are enrolled in. */
export async function list(user, { courseId } = {}) {
  let where = courseId ? { courseId } : {};
  if (user.role !== "admin") {
    const ids = await enrolledCourseIds(user.id);
    const scoped = courseId ? (ids.includes(courseId) ? [courseId] : []) : ids;
    where = { courseId: { in: scoped } };
  }
  const rows = await prisma.material.findMany({ where, orderBy: byWeek });
  return rows.map(serializeMaterial);
}

export async function listForCourse(user, courseId) {
  await assertCourseAccess(user, courseId);
  const rows = await prisma.material.findMany({ where: { courseId }, orderBy: byWeek });
  return rows.map(serializeMaterial);
}

export async function get(user, id) {
  const row = await prisma.material.findUnique({ where: { id } });
  if (!row) throw notFound("Material not found");
  await assertCourseAccess(user, row.courseId);
  return serializeMaterial(row);
}

export async function create(courseId, input) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");
  const row = await prisma.material.create({ data: { ...input, courseId } });
  return serializeMaterial(row);
}

export async function update(id, input) {
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) throw notFound("Material not found");
  const row = await prisma.material.update({ where: { id }, data: input });
  return serializeMaterial(row);
}

export async function remove(id) {
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) throw notFound("Material not found");
  await prisma.material.delete({ where: { id } });
}
