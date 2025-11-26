import { Request, Response, NextFunction } from "express";
import { driver } from "../db/schema";

export const checkDriverActiveStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const driverId = req.driver?._id || req.driver?.id;

    if (!driverId) {
      return res.status(401).json({ message: "Driver not authenticated." });
    }

    // Fetch driver
    const DriverData = await driver.findById(driverId);

    if (!DriverData) {
      return res.status(404).json({ message: "Driver not found." });
    }

    // 🚫 Block if driver is offline/inactive
    if (DriverData.status !== "active") {
      return res.status(469).json({
        message: "You are currently offline. Go online to access this feature.",
      });
    }

    // All good → Allow request
    next();
  } catch (error) {
    console.error("Driver active-status check error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
