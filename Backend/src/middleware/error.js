export const notFound = (_req, _res, next) => next({ status: 404, code: "NOT_FOUND" });

export function errorHandler(err, _req, res, _next) {
  // Prisma errors we can map to the documented contract (§4)
  if (err?.code === "P2025") {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
  }
  if (err?.code === "P2002") {
    const fields = err?.meta?.target;
    const label = Array.isArray(fields) ? fields.join(", ") : fields;
    return res.status(409).json({
      error: { code: "CONFLICT", message: label ? `Already taken: ${label}` : "Duplicate record" },
    });
  }
  if (err?.code === "P2003") {
    return res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: "Referenced record does not exist" } });
  }

  const status = err.status ?? 500;
  const code = err.code ?? (status === 500 ? "INTERNAL" : "ERROR");
  if (status === 500) console.error(err);
  res.status(status).json({ error: { code, message: err.message ?? code, details: err.details } });
}

/**
 * Express 4 does not forward rejected promises to the error handler.
 * Wrap every async controller with this.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
