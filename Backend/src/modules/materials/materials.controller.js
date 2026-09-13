import { asyncHandler } from "../../middleware/error.js";
import * as service from "./materials.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.user, req.validQuery));
});

export const listForCourse = asyncHandler(async (req, res) => {
  res.json(await service.listForCourse(req.user, req.params.courseId));
});

export const get = asyncHandler(async (req, res) => {
  res.json(await service.get(req.user, req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.params.courseId, req.body));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await service.update(req.params.id, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
});
