import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./enrollments.controller.js";

const listQuery = z.object({
  courseId: z.string().optional(),
  studentId: z.string().optional(),
  status: z.enum(["enrolled", "dropped"]).optional(),
});

const bulkSchema = z.object({
  studentIds: z.array(z.string()).min(1, "Pick at least one student"),
});

const router = Router();

// Flat list (additive to §8) — role-scoped in the service.
router.get("/enrollments", validateQuery(listQuery), controller.list);

// Student-facing
router.get("/catalog", requireRole("student"), controller.catalog);
router.get("/me/courses", requireRole("student"), controller.myCourses);
router.post("/courses/:id/enroll", requireRole("student"), controller.selfEnroll);
router.delete("/courses/:id/enroll", requireRole("student"), controller.selfDrop);

// Staff roster management
router.post(
  "/courses/:id/enrollments",
  requireRole("admin"),
  validateBody(bulkSchema),
  controller.enrollMany,
);
router.delete(
  "/courses/:id/enrollments/:studentId",
  requireRole("admin"),
  controller.unenroll,
);

export default router;
