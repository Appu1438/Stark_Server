import { Request, Response, NextFunction } from "express";
import { driver } from "../db/schema"; // import your driver model

export const checkDriverDevice = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Read device info from headers
        const deviceHeader = req.headers["x-device-info"];
        if (!deviceHeader) {
            return res.status(400).json({ message: "Device info missing in request headers." });
        }

        let deviceInfo: any;
        try {
            deviceInfo = typeof deviceHeader === "string" ? JSON.parse(deviceHeader) : deviceHeader;
        } catch (err) {
            return res.status(400).json({ message: "Invalid device info format." });
        }

        const fingerprint = deviceInfo.fingerprint;
        if (!fingerprint) {
            return res.status(400).json({ message: "Device fingerprint missing in device info." });
        }

        // req.driver is set by your auth middleware (from JWT)
        const driverId = req.driver?._id || req.driver?.id;
        if (!driverId) {
            return res.status(401).json({ message: "Driver not authenticated." });
        }

        const DriverData = await driver.findById(driverId);
        if (!DriverData) {
            return res.status(404).json({ message: "Driver not found." });
        }

        // Check fingerprint against active device
        if (DriverData.activeDevice?.fingerprint !== fingerprint) {
            return res.status(460).json({
                message: "You are logged in on a different device. Please login again."
            });
        }

        // All good, continue
        next();
    } catch (err) {
        console.error("Device check error:", err);
        res.status(500).json({ message: "Internal server error." });
    }
};
