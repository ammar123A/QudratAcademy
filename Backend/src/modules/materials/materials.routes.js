import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./materials.controller.js";

const MATERIAL_TYPES = ["reading", "pdf", "slides", "video", "image", "link"];

const listQuery = z.object({ courseId: z.string().optional() });

const createSchema = z.object({
  week: z.coerce.number().int().min(0).optional(),
  title: z.string().min(1),
  type: z.enum(MATERIAL_TYPES).optional(),
  url: z.string().optional(),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial();

const router = Router();

router.get("/materials", validateQuery(listQuery), controller.list);
router.get("/courses/:courseId/materials", controller.listForCourse);
router.post(
  "/courses/:courseId/materials",
  requireRole("admin"),
  validateBody(createSchema),
  controller.create,
);
router.get("/materials/:id", controller.get);
router.patch("/materials/:id", requireRole("admin"), validateBody(updateSchema), controller.update);
router.delete("/materials/:id", requireRole("admin"), controller.remove);

export default router;
