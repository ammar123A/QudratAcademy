import prisma from "../../lib/prisma.js";
import { serializeCourse, serializeEnrollment } from "../../lib/serialize.js";
import { conflict, notFound } from "../../lib/scope.js";

/** Flat, role-scoped list — students see only their own enrolments. */
export async function list(user, { courseId, studentId, status } = {}) {
  const rows = await prisma.enrollment.findMany({
    where: {
      ...(user.role === "admin" ? (studentId ? { studentId } : {}) : { studentId: user.id }),
      ...(courseId ? { courseId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { enrolledAt: "asc" },
  });
  return rows.map(serializeEnrollment);
}

/** Published courses with enrolment counts and whether this student is in them. */
export async function catalog(studentId) {
  const [courses, mine] = await Promise.all([
    prisma.course.findMany({
      where: { status: "published" },
      include: { instructor: true, _count: { select: { enrollments: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.enrollment.findMany({ where: { studentId } }),
  ]);

  const enrolled = new Set(mine.filter((e) => e.status === "enrolled").map((e) => e.courseId));
  return courses.map((c) => ({
    ...serializeCourse(c),
    enrolledCount: c._count.enrollments,
    isEnrolled: enrolled.has(c.id),
  }));
}

export async function myCourses(studentId) {
  const rows = await prisma.enrollment.findMany({
    where: { studentId, status: "enrolled" },
    include: { course: { include: { instructor: true } } },
    orderBy: { enrolledAt: "asc" },
  });
  return rows.map((e) => serializeCourse(e.course));
}

/** A student may self-enrol only in a published course. */
export async function selfEnroll(courseId, studentId) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");
  if (course.status !== "published") {
    throw { status: 403, code: "FORBIDDEN", message: "This course is not open for registration" };
  }

  const existing = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  if (existing?.status === "enrolled") throw conflict("Already enrolled in this course");

  // Re-enrolling after a drop reuses the row.
  if (existing) {
    const row = await prisma.enrollment.update({
      where: { id: existing.id },
      data: { status: "enrolled", enrolledAt: new Date() },
    });
    return serializeEnrollment(row);
  }

  const row = await prisma.enrollment.create({ data: { courseId, studentId } });
  return serializeEnrollment(row);
}

export async function selfDrop(courseId, studentId) {
  const existing = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  if (!existing) throw notFound("You are not enrolled in this course");
  await prisma.enrollment.delete({ where: { id: existing.id } });
}

/** Staff bulk enrol from the roster tab. Already-enrolled students are skipped. */
export async function enrollMany(courseId, studentIds) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound("Course not found");

  const created = [];
  for (const studentId of studentIds) {
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== "student") continue;

    const row = await prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      update: { status: "enrolled" },
      create: { courseId, studentId },
    });
    created.push(serializeEnrollment(row));
  }
  return created;
}

export async function unenroll(courseId, studentId) {
  const existing = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  if (!existing) throw notFound("Enrolment not found");
  await prisma.enrollment.delete({ where: { id: existing.id } });
}
