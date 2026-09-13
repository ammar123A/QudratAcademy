import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma.js";
import { serializeUser } from "../../lib/serialize.js";
import { conflict, notFound } from "../../lib/scope.js";

/**
 * Role-scoped list. Admins see everyone; a student sees only themself, which
 * keeps the front end's `db.users` collection populated without leaking the
 * cohort's contact details.
 */
export async function list(user, { role, status, q } = {}) {
  if (user.role !== "admin") {
    const self = await prisma.user.findUnique({ where: { id: user.id } });
    return [serializeUser(self)];
  }

  const rows = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { matric: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeUser);
}

export async function get(id) {
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) throw notFound("User not found");
  return serializeUser(row);
}

/** `password` is write-only: hashed on the way in, never returned. */
function toData({ password, email, ...rest }) {
  const data = { ...rest };
  if (email != null) data.email = email.toLowerCase().trim();
  if (password) data.passwordHash = bcrypt.hashSync(password, 10);
  return data;
}

async function assertUnique({ email, matric }, exceptId) {
  if (email) {
    const clash = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (clash && clash.id !== exceptId) throw conflict("That email is already registered");
  }
  if (matric) {
    const clash = await prisma.user.findUnique({ where: { matric } });
    if (clash && clash.id !== exceptId) throw conflict("That matric number is already in use");
  }
}

export async function create(input) {
  await assertUnique(input);
  const row = await prisma.user.create({ data: toData(input) });
  return serializeUser(row);
}

export async function update(id, input) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound("User not found");
  await assertUnique(input, id);
  const row = await prisma.user.update({ where: { id }, data: toData(input) });
  return serializeUser(row);
}

/** Cascades to enrolments, attempts, submissions and marks via the schema. */
export async function remove(id) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound("User not found");
  await prisma.user.delete({ where: { id } });
}
