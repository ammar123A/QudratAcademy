import { beforeAll, describe, expect, it } from "vitest";
import { adminToken, api, auth, reseed, studentToken } from "./helpers.js";

beforeAll(() => reseed(), 60_000);

describe("auth", () => {
  it("logs an admin in and returns a token plus the user", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "admin@qudrat.edu", password: "admin123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ id: "u-admin", role: "admin" });
  });

  it("never leaks the password hash", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "admin@qudrat.edu", password: "admin123" });

    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a wrong password with 401 UNAUTHENTICATED", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "admin@qudrat.edu", password: "nope" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rehydrates the session from the token via /auth/me", async () => {
    const res = await auth(api().get("/api/auth/me"), await studentToken());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "s-1001", role: "student", matric: "QN-2024-1001" });
  });

  it("refuses an unauthenticated request with 401", async () => {
    const res = await api().get("/api/courses");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("serves /api/health without a token", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("issues tokens that work on a staff-only route", async () => {
    const res = await auth(api().get("/api/admin/dashboard"), await adminToken());
    expect(res.status).toBe(200);
  });
});
