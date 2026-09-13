import { asyncHandler } from "../../middleware/error.js";
import * as service from "./dashboard.service.js";

export const adminDashboard = asyncHandler(async (_req, res) => {
  res.json(await service.adminDashboard());
});

export const studentDashboard = asyncHandler(async (req, res) => {
  res.json(await service.studentDashboard(req.user.id));
});

export const studentGrades = asyncHandler(async (req, res) => {
  res.json(await service.studentGrades(req.user.id));
});
