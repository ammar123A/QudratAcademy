import { asyncHandler } from "../../middleware/error.js";
import * as service from "./courses.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.user, req.validQuery));
});

export const get = asyncHandler(async (req, res) => {
  res.json(await service.get(req.user, req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.body));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await service.update(req.params.id, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
});

export const summary = asyncHandler(async (req, res) => {
  res.json(await service.summary(req.params.id));
});

export const roster = asyncHandler(async (req, res) => {
  res.json(await service.roster(req.params.id));
});

export const gradebook = asyncHandler(async (req, res) => {
  res.json(await service.gradebook(req.params.id));
});
