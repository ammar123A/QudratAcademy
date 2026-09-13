import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./courses.controller.js";

const listQuery = z.object({
  status: z.enum(["draft", "published"]).optional(),
  q: z.string().optional(),
});

const createSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  credits: z.coerce.number().int().min(0).optional(),
  schedule: z.string().optional(),
  room: z.string().optional(),
  term: z.string().min(1),
  status: z.enum(["draft", "published"]).optional(),
  instructorId: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

const router = Router();

router.get("/courses", validateQuery(listQuery), controller.list);
router.post("/courses", requireRole("admin"), validateBody(createSchema), controller.create);
router.get("/courses/:id", controller.get);
router.patch("/courses/:id", requireRole("admin"), validateBody(updateSchema), controller.update);
router.delete("/courses/:id", requireRole("admin"), controller.remove);

router.get("/courses/:id/summary", requireRole("admin"), controller.summary);
router.get("/courses/:id/roster", requireRole("admin"), controller.roster);
router.get("/courses/:id/gradebook", requireRole("admin"), controller.gradebook);

export default router;
