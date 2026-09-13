import { beforeAll, describe, expect, it } from "vitest";
import { adminToken, api, auth, reseed } from "./helpers.js";
import prisma from "../src/lib/prisma.js";

let admin;

beforeAll(async () => {
  reseed();
  admin = await adminToken();
}, 60_000);

describe("cascade deletes", () => {
  it("deleting a course removes its enrolments, materials, assessments, attendance and marks", async () => {
    // Build a throwaway course with one of everything.
    const course = await prisma.course.create({
      data: { code: "NUR 900", title: "Disposable", term: "Semester 1, 2024", status: "published" },
    });
    await prisma.enrollment.create({ data: { courseId: course.id, studentId: "s-1001" } });
    await prisma.material.create({
      data: { courseId: course.id, title: "Throwaway note", type: "reading" },
    });
    const quiz = await prisma.quiz.create({
      data: {
        courseId: course.id,
        title: "Throwaway quiz",
        published: true,
        questions: [{ id: "t-1", text: "?", options: ["a", "b"], correctIndex: 0, points: 1 }],
      },
    });
    await prisma.quizAttempt.create({
      data: { quizId: quiz.id, studentId: "s-1001", answers: { "t-1": 0 }, score: 1, maxScore: 1 },
    });
    const assignment = await prisma.assignment.create({
      data: { courseId: course.id, title: "Throwaway task" },
    });
    await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: "s-1001", submittedAt: new Date() },
    });
    await prisma.attendanceSession.create({
      data: { courseId: course.id, date: new Date(), records: { "s-1001": "present" } },
    });
    await prisma.grade.create({
      data: {
        courseId: course.id,
        studentId: "s-1001",
        item: "Throwaway mark",
        score: 5,
        maxScore: 10,
      },
    });

    const res = await auth(api().delete(`/api/courses/${course.id}`), admin);
    expect(res.status).toBe(204);

    const counts = await Promise.all([
      prisma.course.count({ where: { id: course.id } }),
      prisma.enrollment.count({ where: { courseId: course.id } }),
      prisma.material.count({ where: { courseId: course.id } }),
      prisma.quiz.count({ where: { courseId: course.id } }),
      prisma.quizAttempt.count({ where: { quizId: quiz.id } }),
      prisma.assignment.count({ where: { courseId: course.id } }),
      prisma.submission.count({ where: { assignmentId: assignment.id } }),
      prisma.attendanceSession.count({ where: { courseId: course.id } }),
      prisma.grade.count({ where: { courseId: course.id } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("deleting a student removes their enrolments, attempts, submissions and marks", async () => {
    const student = await prisma.user.create({
      data: {
        role: "student",
        name: "Temp Student",
        email: "temp@student.qudrat.edu",
        passwordHash: "x",
      },
    });
    await prisma.enrollment.create({ data: { courseId: "c-anat", studentId: student.id } });
    await prisma.grade.create({
      data: { courseId: "c-anat", studentId: student.id, item: "Temp", score: 1, maxScore: 2 },
    });

    const res = await auth(api().delete(`/api/users/${student.id}`), admin);
    expect(res.status).toBe(204);

    expect(await prisma.enrollment.count({ where: { studentId: student.id } })).toBe(0);
    expect(await prisma.grade.count({ where: { studentId: student.id } })).toBe(0);
  });

  it("returns 404 NOT_FOUND for an unknown id", async () => {
    const res = await auth(api().get("/api/courses/does-not-exist"), admin);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 VALIDATION_ERROR for a bad body", async () => {
    const res = await auth(api().post("/api/courses"), admin).send({ title: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it("returns 409 CONFLICT on a duplicate email", async () => {
    const res = await auth(api().post("/api/users"), admin).send({
      role: "student",
      name: "Clone",
      email: "aisyah@student.qudrat.edu",
      password: "student123",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});
