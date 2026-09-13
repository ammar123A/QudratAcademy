const fail = (error) => ({
  status: 400,
  code: "VALIDATION_ERROR",
  message: "Request validation failed",
  details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
});

export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) return next(fail(result.error));
  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) return next(fail(result.error));
  req.validQuery = result.data;
  next();
};
