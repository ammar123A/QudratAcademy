import { asyncHandler } from "../../middleware/error.js";
import { assertSelf } from "../../lib/scope.js";
import * as service from "./users.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.user, req.validQuery));
});

export const get = asyncHandler(async (req, res) => {
  assertSelf(req.user, req.params.id);
  res.json(await service.get(req.params.id));
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
