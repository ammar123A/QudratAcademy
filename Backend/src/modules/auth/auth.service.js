import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma.js";
import { tokenForUser } from "../../lib/jwt.js";
import { serializeUser } from "../../lib/serialize.js";

const badCredentials = {
  status: 401,
  code: "UNAUTHENTICATED",
  message: "Email or password is incorrect",
};

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) throw badCredentials;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw badCredentials;

  return { token: tokenForUser(user), user: serializeUser(user) };
}

export const me = (user) => serializeUser(user);
