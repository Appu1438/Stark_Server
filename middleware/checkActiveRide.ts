import { Request, Response, NextFunction } from "express";
import { Ride, driver } from "../db/schema";

export const checkActiveRide = async (req: any, res: Response, next: NextFunction) => {
    try {
        let driverId = null;

        // 1️⃣ Priority: authenticated driver from token
        if (req.driver?.id) driverId = req.driver.id;

        // 2️⃣ If driverId is passed in body (example: logout, profile update)
        else if (req.body?.driverId) driverId = req.body.driverId;

        // 3️⃣ If phone_number passed → find driver
        else if (req.body?.phone_number) {
            const foundDriver = await driver.findOne({ phone_number: req.body.phone_number });
            if (foundDriver) driverId = foundDriver._id;
        }

        console.log('Active', driverId)

        // 4️⃣ If STILL no driver, block
        if (!driverId) {
            return res.status(401).json({
                success: false,
                message: "Driver authentication failed. Driver ID missing.",
            });
        }

        // 5️⃣ Check for active ride
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
