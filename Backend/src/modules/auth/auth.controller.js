import { asyncHandler } from "../../middleware/error.js";
import * as service from "./auth.service.js";

export const login = asyncHandler(async (req, res) => {
  res.json(await service.login(req.body));
});

export const me = asyncHandler(async (req, res) => {
  res.json(service.me(req.user));
});
