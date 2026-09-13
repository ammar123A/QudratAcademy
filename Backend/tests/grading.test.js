import { beforeAll, describe, expect, it } from "vitest";
import { adminToken, api, auth, reseed, studentToken, tokenFor } from "./helpers.js";

let student;
let admin;

beforeAll(async () => {
  reseed();
  student = await studentToken();
  admin = await adminToken();
}, 60_000);

describe("server-side quiz grading", () => {
  it("scores an all-correct attempt from the stored answer key", async () => {
    // q-2: q2-a correctIndex 1 (3 pts), q2-b correctIndex 3 (3 pts)
    const res = await auth(api().post("/api/quizzes/q-2/attempts"), student).send({
      answers: { "q2-a": 1, "q2-b": 3 },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ score: 6, maxScore: 6, studentId: "s-1001" });
  });

  it("rejects a second attempt with 409 CONFLICT", async () => {
    const res = await auth(api().post("/api/quizzes/q-2/attempts"), student).send({
      answers: { "q2-a": 1, "q2-b": 3 },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("ignores a client-sent score — only answers count", async () => {
    const daniel = await tokenFor("daniel@student.qudrat.edu", "student123");
    const res = await auth(api().post("/api/quizzes/q-2/attempts"), daniel).send({
      answers: { "q2-a": 0, "q2-b": 3 }, // first wrong, second right
      score: 999,
      maxScore: 999,
    });
    expect(res.status).toBe(201);
    expect(res.body.score).toBe(3);
    expect(res.body.maxScore).toBe(6);
  });

  it("keeps the seeded attempt at 4/6", async () => {
    const res = await auth(api().get("/api/quizzes/q-1/attempts"), admin);
    expect(res.status).toBe(200);
    const seeded = res.body.find((a) => a.id === "qa-1");
    expect(seeded).toMatchObject({ score: 4, maxScore: 6, studentId: "s-1002" });
  });
});

describe("weighted course grade (§7)", () => {
  // s-1001 in c-anat: g-1 42/50 = 84% at weight 15, sub-1 18/20 = 90% at weight 10.
  // round((84*15 + 90*10) / 25) = round(86.4) = 86 -> "A"
  it("computes 86 / A for s-1001 in c-anat via the gradebook", async () => {
    const res = await auth(api().get("/api/courses/c-anat/gradebook"), admin);
    expect(res.status).toBe(200);

    const row = res.body.find((r) => r.student.id === "s-1001");
    expect(row.overall).toBe(86);
    expect(row.letter).toBe("A");
    expect(row.totalWeight).toBe(25);
    expect(row.parts).toHaveLength(2);
  });

  it("reports the same number on the student's own /me/grades", async () => {
    const res = await auth(api().get("/api/me/grades"), student);
    expect(res.status).toBe(200);

    const anat = res.body.courses.find((c) => c.id === "c-anat");
    expect(anat.overall).toBe(86);
    expect(anat.letter).toBe("A");
    expect(res.body.gradedCount).toBeGreaterThan(0);
    expect(res.body.gpa).toBeGreaterThan(0);
  });

  it("counts present, late and excused toward the attendance rate", async () => {
    // s-1001 in c-anat: att-1 present, att-2 present -> 2/2 = 100%
    const res = await auth(api().get("/api/courses/c-anat/attendance/me"), student);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ present: 2, total: 2, rate: 100 });
    expect(res.body.sessions).toHaveLength(2);
  });
});
