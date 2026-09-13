import { verify } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next({ status: 401, code: "UNAUTHENTICATED", message: "Missing bearer token" });
  try {
    const { sub } = verify(token);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user) return next({ status: 401, code: "UNAUTHENTICATED", message: "Unknown user" });
    req.user = user;
    next();
  } catch {
    next({ status: 401, code: "UNAUTHENTICATED", message: "Invalid or expired token" });
  }
}

export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : next({ status: 403, code: "FORBIDDEN", message: "Insufficient role" });

export const isStaff = (user) => user?.role === "admin";
