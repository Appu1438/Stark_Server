import { Request, Response, NextFunction } from "express";
import { Ride, driver } from "../db/schema";

export const checkActiveRide = async (req: any, res: Response, next: NextFunction) => {
    try {
        let driverId = null;

        // 1️⃣ From token (protected routes)
        if (req.driver?.id) {
            driverId = req.driver.id;
        }

        // 2️⃣ From body
        else if (req.body?.driverId) {
            driverId = req.body.driverId;
        }

        // 3️⃣ Login route → if phone_number provided, check if driver exists
        else if (req.body?.phone_number) {
            const foundDriver = await driver.findOne({ phone_number: req.body.phone_number });

            // 🚨 If driver NOT found → allow login, skip ride check
            if (!foundDriver) {
                return next();
            }

            driverId = foundDriver._id;
        }

        // 4️⃣ If no driverId AND not login → block
        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "Driver authentication failed. Driver ID missing.",
            });
        }

        // 5️⃣ Check active ride
        const activeRide = await Ride.findOne({
            driverId,
            status: { $in: ["Booked", "Processing", "Arrived", "Ongoing", "Reached"] },
        });

        if (activeRide) {
            return res.status(423).json({
                success: false,
                blockLogout: true,
                message: "You can't perform this action while on a ride.",
                activeRideId: activeRide._id,
            });
        }

        next();

    } catch (error) {
        console.error("Active ride check error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
