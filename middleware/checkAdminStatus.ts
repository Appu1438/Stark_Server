
import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { admin, driver, User } from "../db/schema";

export const isActiveAdmin = (req: any, res: Response, next: NextFunction) => {
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

            const adminData = await admin.findById(decoded.id).select("-password");
            if (!adminData) {
                return res.status(401).json({ message: "Admin not found" });
            }

            if (!adminData.status || adminData.status.toLowerCase() !== "active") {
                return res.status(460).json({ message: "Your admin account is not active" });
            }

            req.admin = adminData;
            next();
        });
    } catch (error) {
        console.error("Admin auth error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};