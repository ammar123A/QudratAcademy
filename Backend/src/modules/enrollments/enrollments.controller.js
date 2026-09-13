import { asyncHandler } from "../../middleware/error.js";
import * as service from "./enrollments.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.user, req.validQuery));
});

export const catalog = asyncHandler(async (req, res) => {
  res.json(await service.catalog(req.user.id));
});

export const myCourses = asyncHandler(async (req, res) => {
  res.json(await service.myCourses(req.user.id));
});

export const selfEnroll = asyncHandler(async (req, res) => {
  res.status(201).json(await service.selfEnroll(req.params.id, req.user.id));
});

export const selfDrop = asyncHandler(async (req, res) => {
  await service.selfDrop(req.params.id, req.user.id);
  res.status(204).end();
});

export const enrollMany = asyncHandler(async (req, res) => {
  res.status(201).json(await service.enrollMany(req.params.id, req.body.studentIds));
});

export const unenroll = asyncHandler(async (req, res) => {
  await service.unenroll(req.params.id, req.params.studentId);
  res.status(204).end();
});
