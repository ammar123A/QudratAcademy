import "dotenv/config";
import { execFileSync } from "node:child_process";
import request from "supertest";
import { createApp } from "../src/app.js";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

export const app = createApp();
export const api = () => request(app);

/** Restore the §11 demo data so every test file starts from a known state. */
export function reseed() {
  execFileSync(process.execPath, ["prisma/seed.js"], {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    stdio: "pipe",
  });
}

export async function tokenFor(email, password) {
  const res = await api().post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

export const adminToken = () => tokenFor("admin@qudrat.edu", "admin123");
export const studentToken = () => tokenFor("aisyah@student.qudrat.edu", "student123");
export const auth = (req, token) => req.set("Authorization", `Bearer ${token}`);
