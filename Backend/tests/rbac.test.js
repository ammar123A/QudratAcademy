import { beforeAll, describe, expect, it } from "vitest";
import { api, auth, reseed, studentToken } from "./helpers.js";

let student;

beforeAll(async () => {
  reseed();
  student = await studentToken();
}, 60_000);

describe("role-based access control", () => {
  it("blocks a student from creating a course", async () => {
    const res = await auth(api().post("/api/courses"), student).send({
      code: "NUR 999",
      title: "Sneaky Course",
      term: "Semester 1, 2024",
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("blocks a student from the admin dashboard", async () => {
    const res = await auth(api().get("/api/admin/dashboard"), student);
    expect(res.status).toBe(403);
  });

  it("blocks a student from another student's record", async () => {
    const res = await auth(api().get("/api/users/s-1002"), student);
    expect(res.status).toBe(403);
  });

  it("lets a student read their own record", async () => {
    const res = await auth(api().get("/api/users/s-1001"), student);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("s-1001");
  });

  it("hides draft courses from students", async () => {
    const res = await auth(api().get("/api/courses"), student);
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.id)).not.toContain("c-pharm");
    expect(res.body.every((c) => c.status === "published")).toBe(true);
  });

  it("never sends correctIndex to a student", async () => {
    const one = await auth(api().get("/api/quizzes/q-1"), student);
    expect(one.status).toBe(200);
    expect(one.body.questions.length).toBeGreaterThan(0);
    expect(one.body.questions.every((q) => q.correctIndex === undefined)).toBe(true);

    const many = await auth(api().get("/api/quizzes"), student);
    expect(JSON.stringify(many.body)).not.toContain("correctIndex");
  });

  it("narrows a student's flat attendance list to their own records", async () => {
    const res = await auth(api().get("/api/attendance"), student);
    expect(res.status).toBe(200);
    for (const session of res.body) {
      expect(Object.keys(session.records)).toEqual(
        expect.arrayContaining(Object.keys(session.records).filter((k) => k === "s-1001")),
      );
      expect(Object.keys(session.records).filter((k) => k !== "s-1001")).toEqual([]);
    }
    // c-pharm has no sessions and the student is not enrolled anyway
    expect(res.body.length).toBe(3);
  });

  it("scopes a student's flat users list to themself", async () => {
    const res = await auth(api().get("/api/users"), student);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("s-1001");
  });

  it("scopes a student's flat grades list to their own marks", async () => {
    const res = await auth(api().get("/api/grades"), student);
    expect(res.status).toBe(200);
    expect(res.body.every((g) => g.studentId === "s-1001")).toBe(true);
    expect(res.body.map((g) => g.id).sort()).toEqual(["g-1", "g-3"]);
  });

  it("stops a student self-enrolling in a draft course", async () => {
    const res = await auth(api().post("/api/courses/c-pharm/enroll"), student);
    expect(res.status).toBe(403);
  });
});
