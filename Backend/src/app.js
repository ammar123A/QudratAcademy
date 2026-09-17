import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";

import { notFound, errorHandler } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";

import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import coursesRoutes from "./modules/courses/courses.routes.js";
import enrollmentsRoutes from "./modules/enrollments/enrollments.routes.js";
import materialsRoutes from "./modules/materials/materials.routes.js";
import quizzesRoutes from "./modules/quizzes/quizzes.routes.js";
import assignmentsRoutes from "./modules/assignments/assignments.routes.js";
import attendanceRoutes from "./modules/attendance/attendance.routes.js";
import gradesRoutes from "./modules/grades/grades.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import uploadsRoutes from "./modules/uploads/uploads.routes.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
  app.use(express.json({ limit: "2mb" }));

  if (process.env.NODE_ENV === "production") {
    // Plain JSON logs — pino-pretty is a dev dependency and may not be installed.
    app.use(pinoHttp());
  } else if (process.env.NODE_ENV !== "test") {
    app.use(pinoHttp({ transport: { target: "pino-pretty", options: { colorize: true } } }));
  }

  // Public
  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api/auth", authRoutes);
  app.use("/uploads", express.static(process.env.UPLOAD_DIR ?? "./uploads"));

  // Everything below needs a bearer token
  app.use("/api", requireAuth);

  // Dashboards first: /me/dashboard and /me/grades must not be shadowed by
  // the enrolments router's /me/courses sibling paths.
  app.use("/api", dashboardRoutes);
  app.use("/api", usersRoutes);
  app.use("/api", coursesRoutes);
  app.use("/api", enrollmentsRoutes);
  app.use("/api", materialsRoutes);
  app.use("/api", quizzesRoutes);
  app.use("/api", assignmentsRoutes);
  app.use("/api", attendanceRoutes);
  app.use("/api", gradesRoutes);
  app.use("/api", uploadsRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
