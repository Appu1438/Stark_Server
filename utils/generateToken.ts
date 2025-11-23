import jwt from "jsonwebtoken";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

export const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, REFRESH_TOKEN_SECRET, { expiresIn: "30d" });
};

export const generateAccessTokenAdmin = (admin) => {
  return jwt.sign({ id: admin._id, role: admin.role }, ACCESS_TOKEN_SECRET, { expiresIn: "10m" });
};

export const generateRefreshTokenAdmin = (admin) => {
  return jwt.sign({ id: admin._id, role: admin.role }, REFRESH_TOKEN_SECRET, { expiresIn: "1d" });
};
