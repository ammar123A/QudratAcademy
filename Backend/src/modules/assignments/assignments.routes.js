import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./assignments.controller.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  maxPoints: z.coerce.number().int().min(1).optional(),
  published: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const listQuery = z.object({ courseId: z.string().optional() });
const submissionsQuery = z.object({
  assignmentId: z.string().optional(),
  studentId: z.string().optional(),
});

const submitSchema = z.object({
  note: z.string().optional(),
  fileName: z.string().optional(),
  fileUrl: z.string().optional(),
});

// Accepts both shapes; the service decides which fields it honours by role.
const patchSubmissionSchema = z.object({
  grade: z.coerce.number().int().min(0).nullable().optional(),
  feedback: z.string().optional(),
  status: z.enum(["submitted", "graded"]).optional(),
  note: z.string().optional(),
  fileName: z.string().optional(),
  fileUrl: z.string().optional(),
});

const router = Router();

router.get("/assignments", validateQuery(listQuery), controller.list);
router.get("/submissions", validateQuery(submissionsQuery), controller.listSubmissions);

router.get("/courses/:courseId/assignments", controller.listForCourse);
router.post(
  "/courses/:courseId/assignments",
  requireRole("admin"),
  validateBody(createSchema),
  controller.create,
);

router.get("/assignments/:id/submissions/me", requireRole("student"), controller.mySubmission);
router.get(
  "/assignments/:id/submissions",
  requireRole("admin"),
  controller.submissionsForAssignment,
);
router.post(
  "/assignments/:id/submissions",
  requireRole("student"),
  validateBody(submitSchema),
  controller.submit,
);

router.get("/assignments/:id", controller.get);
router.patch(
  "/assignments/:id",
  requireRole("admin"),
  validateBody(updateSchema),
  controller.update,
);
router.delete("/assignments/:id", requireRole("admin"), controller.remove);

router.patch(
  "/submissions/:id",
  validateBody(patchSubmissionSchema),
  controller.patchSubmission,
);

export default router;
