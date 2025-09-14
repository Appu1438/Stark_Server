// middleware/checkAdminRole.ts
import { NextFunction, Request, Response } from "express";
export const checkAdminRole = (roles: string[] = []) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const admin = req.admin; // populated by token middleware

        if (!admin) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        if (!roles.includes(admin.role)) {
            return res.status(403).json({ message: "Access denied." });
        }

        next();
    };
};
