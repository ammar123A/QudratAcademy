import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import * as controller from "./auth.controller.js";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

const router = Router();

router.post("/login", validateBody(loginSchema), controller.login);
router.get("/me", requireAuth, controller.me);

export default router;
