import { PrismaClient } from "@prisma/client";

// Singleton — `node --watch` re-imports on change, so reuse the client across reloads
// to avoid exhausting the connection pool.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__qudratPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__qudratPrisma = prisma;

export default prisma;
