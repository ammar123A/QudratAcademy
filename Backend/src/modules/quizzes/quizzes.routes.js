import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./quizzes.controller.js";

const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(z.string()).min(2, "A question needs at least two options"),
  correctIndex: z.coerce.number().int().min(0),
  points: z.coerce.number().int().min(0).default(1),
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  published: z.boolean().optional(),
  questions: z.array(questionSchema).optional(),
});

const updateSchema = createSchema.partial();

const listQuery = z.object({ courseId: z.string().optional() });
const attemptsQuery = z.object({
  quizId: z.string().optional(),
  studentId: z.string().optional(),
});

// The client sends only answers; the server computes the score.
const attemptSchema = z.object({
  answers: z.record(z.string(), z.coerce.number().int().min(0)).default({}),
});

const router = Router();

router.get("/quizzes", validateQuery(listQuery), controller.list);
router.get("/quiz-attempts", validateQuery(attemptsQuery), controller.listAttempts);

router.get("/courses/:courseId/quizzes", controller.listForCourse);
router.post(
  "/courses/:courseId/quizzes",
  requireRole("admin"),
  validateBody(createSchema),
  controller.create,
);

// More specific paths before /quizzes/:id so they are not shadowed.
router.get("/quizzes/:id/attempts/me", requireRole("student"), controller.myAttempt);
router.get("/quizzes/:id/attempts", requireRole("admin"), controller.attemptsForQuiz);
router.post(
  "/quizzes/:id/attempts",
  requireRole("student"),
  validateBody(attemptSchema),
  controller.submitAttempt,
);

router.get("/quizzes/:id", controller.get);
router.patch("/quizzes/:id", requireRole("admin"), validateBody(updateSchema), controller.update);
router.delete("/quizzes/:id", requireRole("admin"), controller.remove);

export default router;
