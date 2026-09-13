import { asyncHandler } from "../../middleware/error.js";
import * as service from "./assignments.service.js";

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

export const listSubmissions = asyncHandler(async (req, res) => {
  res.json(await service.listSubmissions(req.user, req.validQuery));
});

export const submissionsForAssignment = asyncHandler(async (req, res) => {
  res.json(await service.submissionsForAssignment(req.params.id));
});

export const mySubmission = asyncHandler(async (req, res) => {
  res.json(await service.mySubmission(req.params.id, req.user.id));
});

export const submit = asyncHandler(async (req, res) => {
  res.status(201).json(await service.submit(req.params.id, req.user.id, req.body));
});

export const patchSubmission = asyncHandler(async (req, res) => {
  res.json(await service.patchSubmission(req.user, req.params.id, req.body));
});
