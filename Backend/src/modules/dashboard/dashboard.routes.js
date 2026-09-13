import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import * as controller from "./dashboard.controller.js";

const router = Router();

router.get("/admin/dashboard", requireRole("admin"), controller.adminDashboard);
router.get("/me/dashboard", requireRole("student"), controller.studentDashboard);
router.get("/me/grades", requireRole("student"), controller.studentGrades);

export default router;
