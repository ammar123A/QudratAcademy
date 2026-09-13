import prisma from "../../lib/prisma.js";
import { serializeCourse, serializeSubmission } from "../../lib/serialize.js";
import { attendanceSummary, courseGrade, gpaFor, letterGrade } from "../../lib/grades.js";

/* ── Admin ──────────────────────────────────────────────────────────── */

export async function adminDashboard() {
  const [courses, students, awaitingGrading, sessions, recent] = await Promise.all([
    prisma.course.findMany({
      include: { instructor: true, _count: { select: { enrollments: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ where: { role: "student" } }),
    prisma.submission.count({ where: { status: "submitted" } }),
    prisma.attendanceSession.count(),
    prisma.submission.findMany({
      where: { submittedAt: { not: null } },
      include: { student: true, assignment: true },
      orderBy: { submittedAt: "desc" },
      take: 8,
    }),
  ]);

  return {
    counts: {
      courses: courses.length,
      publishedCourses: courses.filter((c) => c.status === "published").length,
      students: students.length,
      activeStudents: students.filter((s) => s.status === "active").length,
      awaitingGrading,
      sessions,
    },
    courses: courses.map((c) => ({
      ...serializeCourse(c),
      studentCount: c._count.enrollments,
    })),
    recentSubmissions: recent.map((s) => ({
      ...serializeSubmission(s),
      studentName: s.student?.name ?? "",
      assignmentTitle: s.assignment?.title ?? "",
    })),
  };
}

/* ── Student ────────────────────────────────────────────────────────── */

/**
 * Loads everything a student's own aggregates need in one pass, so both
 * /me/dashboard and /me/grades run the §7 formula over identical data.
 */
async function studentBundle(studentId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "enrolled" },
    include: { course: { include: { instructor: true } } },
    orderBy: { enrolledAt: "asc" },
  });
  const courseIds = enrollments.map((e) => e.courseId);

  const [grades, assignments, quizzes, submissions, attempts, sessions] = await Promise.all([
    prisma.grade.findMany({ where: { studentId, courseId: { in: courseIds } } }),
    prisma.assignment.findMany({ where: { courseId: { in: courseIds }, published: true } }),
    prisma.quiz.findMany({ where: { courseId: { in: courseIds }, published: true } }),
    prisma.submission.findMany({ where: { studentId, assignment: { courseId: { in: courseIds } } } }),
    prisma.quizAttempt.findMany({ where: { studentId, quiz: { courseId: { in: courseIds } } } }),
    prisma.attendanceSession.findMany({ where: { courseId: { in: courseIds } }, orderBy: { date: "asc" } }),
  ]);

  const perCourse = enrollments.map((e) => {
    const courseId = e.courseId;
    const courseQuizzes = quizzes.filter((q) => q.courseId === courseId);
    const courseAssignments = assignments.filter((a) => a.courseId === courseId);
    const { parts, totalWeight, overall } = courseGrade({
      grades: grades.filter((g) => g.courseId === courseId),
      assignments: courseAssignments,
      submissions,
      quizzes: courseQuizzes,
      attempts,
    });
    const attendance = attendanceSummary(
      sessions.filter((s) => s.courseId === courseId),
      studentId,
    );
    return {
      course: serializeCourse(e.course),
      credits: e.course.credits,
      quizzes: courseQuizzes,
      assignments: courseAssignments,
      parts,
      totalWeight,
      overall,
      attendance,
    };
  });

  return { perCourse, submissions, attempts, sessions };
}

export async function studentDashboard(studentId) {
  const { perCourse, submissions, attempts, sessions } = await studentBundle(studentId);

  const attemptedQuizIds = new Set(attempts.map((a) => a.quizId));
  const submittedAssignmentIds = new Set(submissions.map((s) => s.assignmentId));

  let pendingQuizzes = 0;
  let pendingAssignments = 0;
  const deadlines = [];

  for (const c of perCourse) {
    for (const q of c.quizzes) {
      if (!attemptedQuizIds.has(q.id)) {
        pendingQuizzes += 1;
        if (q.dueDate) {
          deadlines.push({ type: "quiz", title: q.title, courseCode: c.course.code, due: q.dueDate });
        }
      }
    }
    for (const a of c.assignments) {
      if (!submittedAssignmentIds.has(a.id)) {
        pendingAssignments += 1;
        if (a.dueDate) {
          deadlines.push({
            type: "assignment",
            title: a.title,
            courseCode: c.course.code,
            due: a.dueDate,
          });
        }
      }
    }
  }

  deadlines.sort((a, b) => new Date(a.due) - new Date(b.due));

  const overallAttendance = attendanceSummary(sessions, studentId);

  return {
    courses: perCourse.map((c) => ({
      ...c.course,
      overall: c.overall,
      attendanceRate: c.attendance.rate,
    })),
    pendingQuizzes,
    pendingAssignments,
    deadlines,
    attendanceRate: overallAttendance.rate,
  };
}

export async function studentGrades(studentId) {
  const { perCourse } = await studentBundle(studentId);

  const courses = perCourse.map((c) => ({
    ...c.course,
    parts: c.parts,
    totalWeight: c.totalWeight,
    overall: c.overall,
    letter: letterGrade(c.overall),
  }));

  const graded = courses.filter((c) => c.overall != null);
  const average = graded.length
    ? Math.round(graded.reduce((s, c) => s + c.overall, 0) / graded.length)
    : null;

  return {
    gpa: gpaFor(perCourse.map((c) => ({ overall: c.overall, credits: c.credits }))),
    average,
    gradedCount: graded.length,
    courses,
  };
}
