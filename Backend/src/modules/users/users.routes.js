import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./users.controller.js";

const listQuery = z.object({
  role: z.enum(["admin", "student"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  q: z.string().optional(),
});

const createSchema = z.object({
  role: z.enum(["admin", "student"]).default("student"),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  avatarColor: z.string().optional(),
  // staff
  title: z.string().optional(),
  // student
  matric: z.string().optional(),
  cohort: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const updateSchema = createSchema.partial();

const router = Router();

router.get("/users", validateQuery(listQuery), controller.list);
router.post("/users", requireRole("admin"), validateBody(createSchema), controller.create);
router.get("/users/:id", controller.get); // staff, or a student reading themself
router.patch("/users/:id", requireRole("admin"), validateBody(updateSchema), controller.update);
router.delete("/users/:id", requireRole("admin"), controller.remove);

export default router;
