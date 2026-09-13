import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./attendance.controller.js";

const ATTENDANCE_STATUSES = ["present", "late", "excused", "absent"];

const recordsSchema = z.record(z.string(), z.enum(ATTENDANCE_STATUSES));

const createSchema = z.object({
  date: z.coerce.date(),
  topic: z.string().optional(),
  records: recordsSchema.default({}),
});

const updateSchema = z.object({
  date: z.coerce.date().optional(),
  topic: z.string().optional(),
  records: recordsSchema.optional(),
});

const listQuery = z.object({ courseId: z.string().optional() });

const router = Router();

router.get("/attendance", validateQuery(listQuery), controller.list);

// Student route first — /attendance/me must not be read as an :id.
router.get(
  "/courses/:courseId/attendance/me",
  requireRole("student"),
  controller.mySummary,
);
router.get("/courses/:courseId/attendance", requireRole("admin"), controller.listForCourse);
router.post(
  "/courses/:courseId/attendance",
  requireRole("admin"),
  validateBody(createSchema),
  controller.create,
);

router.patch(
  "/attendance/:id",
  requireRole("admin"),
  validateBody(updateSchema),
  controller.update,
);
router.delete("/attendance/:id", requireRole("admin"), controller.remove);

export default router;
