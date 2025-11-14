import { Request, Response, NextFunction } from "express";
import { driver, User } from "../db/schema"; // your driver model

export const checkUserApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // req.driver should be set by your auth middleware
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Driver not authenticated." });
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.status(404).json({ message: "Driver not found." });
        }

        // Check if driver is approved
        if (!userData.is_approved) {
            console.log('Not Approved')

            // Use custom status code 470 (example) for suspended/not approved
            return res.status(470).json({
                message: "Your account is not approved or has been suspended. Contact support."
            });
        }


        console.log('Approved')
        next();
    } catch (err) {
        console.error("User approval check error:", err);
        res.status(500).json({ message: "Internal server error." });
    }
};
