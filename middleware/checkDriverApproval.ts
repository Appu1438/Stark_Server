import { Request, Response, NextFunction } from "express";
import { driver } from "../db/schema"; // your driver model

export const checkDriverApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.driver should be set by your auth middleware
    const driverId = req.driver?._id || req.driver?.id;
    if (!driverId) {
      return res.status(401).json({ message: "Driver not authenticated." });
    }

    const DriverData = await driver.findById(driverId);
    if (!DriverData) {
      return res.status(404).json({ message: "Driver not found." });
    }

    // Check if driver is approved
    if (!DriverData.is_approved) {
      // Use custom status code 470 (example) for suspended/not approved
      return res.status(470).json({
        message: "Your account is not approved or has been suspended. Contact support."
      });
    }

    // All good, continue
    next();
  } catch (err) {
    console.error("Driver approval check error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};
