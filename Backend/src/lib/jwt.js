import jwt from "jsonwebtoken";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
};

export const sign = (payload) =>
  jwt.sign(payload, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

export const verify = (token) => jwt.verify(token, secret());

export const tokenForUser = (user) => sign({ sub: user.id, role: user.role });
