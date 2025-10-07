import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { admin, driver, User } from "../db/schema";

export const isAuthenticated = (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Please Log in to access this content!" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    // console.log('Access Token ', token)

    // Verify the token
    jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET!,
      async (err: any, decoded: any) => {
        if (err) {
          return res.status(401).json({ message: "Invalid token" });
        }

        const userData = await User.findById(decoded.id);
        // console.log(decoded , userData)
        // Attach the user data to the request object
        req.user = userData;
        next();
      }
    );
  } catch (error) {
    console.log(error);
  }
};

export const isAuthenticatedDriver = (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Please Log in to access this content!" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    // console.log('Access Token ', token)

    // Verify the token
    jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET!,
      async (err: any, decoded: any) => {
        if (err) {
          return res.status(401).json({ message: "Invalid token" });
        }

        const driverData = await driver.findById(decoded.id);
        // Attach the user data to the request object
        req.driver = driverData;
        next();
      }
    );
  } catch (error) {
    console.log(error);
  }
};

export const isAuthenticatedAdmin = (req: any, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Please log in as admin to access this content!" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, async (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // 🔄 Now using mongoose instead of prisma
      const adminData = await admin.findById(decoded.id).select("-password");
      if (!adminData) {
        return res.status(401).json({ message: "Admin not found" });
      }

      req.admin = adminData;
      next();
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


