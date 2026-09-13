import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./grades.controller.js";

const createSchema = z.object({
  studentId: z.string().min(1),
  item: z.string().min(1),
  category: z.string().optional(),
  score: z.coerce.number(),
  maxScore: z.coerce.number().positive("maxScore must be greater than zero"),
  weight: z.coerce.number().min(0).optional(),
  note: z.string().optional(),
  recordedAt: z.coerce.date().optional(),
});

const updateSchema = createSchema.partial();

const listQuery = z.object({
  courseId: z.string().optional(),
  studentId: z.string().optional(),
});

const router = Router();

router.get("/grades", validateQuery(listQuery), controller.list);

// Student route first so /grades/me is not read as an :id.
router.get(
  "/courses/:courseId/grades/me",
  requireRole("student"),
  controller.myGradesForCourse,
);
router.get(
  "/courses/:courseId/grades",
  requireRole("admin"),
  validateQuery(listQuery),
  controller.listForCourse,
);
router.post(
  "/courses/:courseId/grades",
  requireRole("admin"),
  validateBody(createSchema),
  controller.create,
);

router.patch("/grades/:id", requireRole("admin"), validateBody(updateSchema), controller.update);
router.delete("/grades/:id", requireRole("admin"), controller.remove);

export default router;
