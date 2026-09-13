import prisma from "../../lib/prisma.js";
import { serializeCourse, serializeEnrollment, serializeUser } from "../../lib/serialize.js";
import { courseGrade, letterGrade } from "../../lib/grades.js";
import { notFound, rosterStudentIds } from "../../lib/scope.js";

const withInstructor = { instructor: true };

/** Admins see every course; students only ever see `published` ones. */
export async function list(user, { status, q } = {}) {
  const rows = await prisma.course.findMany({
    where: {
      ...(user.role === "admin" ? (status ? { status } : {}) : { status: "published" }),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { ...withInstructor, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeCourse);
}

export async function get(user, id) {
  const row = await prisma.course.findUnique({ where: { id }, include: withInstructor });
  if (!row) throw notFound("Course not found");
  if (user.role !== "admin" && row.status !== "published") throw notFound("Course not found");
  return serializeCourse(row);
}

export async function create(input) {
  const row = await prisma.course.create({ data: input, include: withInstructor });
  return serializeCourse(row);
}

export async function update(id, input) {
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw notFound("Course not found");
  const row = await prisma.course.update({
    where: { id },
    data: input,
    include: withInstructor,
  });
  return serializeCourse(row);
}

/** Cascades to enrolments, materials, assessments, attendance and marks. */
export async function remove(id) {
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw notFound("Course not found");
  await prisma.course.delete({ where: { id } });
}

export async function summary(id) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          enrollments: true,
          materials: true,
          quizzes: true,
          assignments: true,
          attendance: true,
        },
      },
    },
  });
  if (!course) throw notFound("Course not found");
  return {
    studentCount: course._count.enrollments,
    materialCount: course._count.materials,
    quizCount: course._count.quizzes,
    assignmentCount: course._count.assignments,
    sessionCount: course._count.attendance,
  };
}

export async function roster(id) {
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw notFound("Course not found");

  const rows = await prisma.enrollment.findMany({
    where: { courseId: id },
    include: { student: true },
    orderBy: { enrolledAt: "asc" },
  });
  return rows.map((e) => ({
    student: serializeUser(e.student),
    enrollment: serializeEnrollment(e),
  }));
}

/**
 * Every enrolled student's weighted grade for this course (§7). One query per
 * collection, then the formula runs in memory — the POC dataset is small.
 */
export async function gradebook(id) {
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw notFound("Course not found");

  const studentIds = await rosterStudentIds(id);
  const [students, grades, assignments, quizzes, submissions, attempts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: studentIds } } }),
    prisma.grade.findMany({ where: { courseId: id } }),
    prisma.assignment.findMany({ where: { courseId: id } }),
    prisma.quiz.findMany({ where: { courseId: id } }),
    prisma.submission.findMany({ where: { assignment: { courseId: id } } }),
    prisma.quizAttempt.findMany({ where: { quiz: { courseId: id } } }),
  ]);

  const byId = new Map(students.map((s) => [s.id, s]));

  return studentIds.map((studentId) => {
    const { parts, totalWeight, overall } = courseGrade({
      grades: grades.filter((g) => g.studentId === studentId),
      assignments,
      submissions: submissions.filter((s) => s.studentId === studentId),
      quizzes,
      attempts: attempts.filter((a) => a.studentId === studentId),
    });
    return {
      student: serializeUser(byId.get(studentId)),
      parts,
      totalWeight,
      overall,
      letter: letterGrade(overall),
    };
  });
}
