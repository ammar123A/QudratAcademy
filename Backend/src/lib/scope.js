import prisma from "./prisma.js";

/** Course ids a student is actively enrolled in. */
export async function enrolledCourseIds(studentId) {
  const rows = await prisma.enrollment.findMany({
    where: { studentId, status: "enrolled" },
    select: { courseId: true },
  });
  return rows.map((r) => r.courseId);
}

/** Throws 403 unless the student is enrolled in the course (admins always pass). */
export async function assertCourseAccess(user, courseId) {
  if (user.role === "admin") return;
  const found = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId: user.id } },
  });
  if (!found || found.status !== "enrolled") {
    throw { status: 403, code: "FORBIDDEN", message: "Not enrolled in this course" };
  }
}

/** Throws 403 if a student is reaching for another student's data. */
export function assertSelf(user, studentId) {
  if (user.role !== "admin" && user.id !== studentId) {
    throw { status: 403, code: "FORBIDDEN", message: "Cannot access another student's data" };
  }
}

export const notFound = (message = "Resource not found") => ({
  status: 404,
  code: "NOT_FOUND",
  message,
});

export const conflict = (message = "Duplicate record") => ({
  status: 409,
  code: "CONFLICT",
  message,
});

/** Active student ids on a course roster, in enrolment order. */
export async function rosterStudentIds(courseId) {
  const rows = await prisma.enrollment.findMany({
    where: { courseId, status: "enrolled" },
    orderBy: { enrolledAt: "asc" },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}
