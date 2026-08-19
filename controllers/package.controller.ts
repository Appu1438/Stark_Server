import { driver, PackageTrip } from "../db/schema";
const axios = require("axios");


export const getAllPackageTrips = async (req: any, res: any) => {
    try {
        const trips = await PackageTrip.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: trips.length,
            data: trips,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch package trips",
            error: error.message,
        });
    }
};

export const createPackageTrip = async (req: any, res: any) => {
    try {
        const {
            pickupLocation,
            dropLocation,
            startDate,
            endDate,
            cabType,
            priority,
            description,
            contactNumber,
        } = req.body;

        // ✅ Basic validation
        if (
            !pickupLocation ||
            !dropLocation ||
            !startDate ||
            !endDate ||
            !cabType
        ) {
            return res.status(400).json({
                success: false,
                message: "Required fields missing",
            });
        }

        // ✅ Create trip
        const newTrip = new PackageTrip({
            pickupLocation,
            dropLocation,
            startDate,
            endDate,
            cabType,
            priority,
            description,
            contactNumber,
        });

        const savedTrip = await newTrip.save();

        // Send notification to all drivers
        try {
            const drivers = await driver.find(
                {
                    notificationToken: {
                        $exists: true,
                        $nin: [null, ""],
                    },
                },
                {
                    notificationToken: 1,
                }
            );

            const driverTokens = [
                ...new Set(
                    drivers
                        .map((driver) => driver.notificationToken)
                        .filter(Boolean)
                ),
            ];

            if (driverTokens.length > 0) {
                const messages = driverTokens.map((token) => ({
                    to: token,
                    sound: "default",
                    title: "🚕 New Urgent Requirement",
                    body: `New urgent requirement : from ${pickupLocation} → ${dropLocation} . Check the details and submit your interest!`,

                }));

                await axios.post(
                    "https://exp.host/--/api/v2/push/send",
                    messages,
                    {
                        headers: {
                            "Content-Type": "application/json",
                        },
                    }
                );

                console.log(
                    `Package trip notification sent to ${driverTokens.length} drivers`
                );
            }
        } catch (notificationError: any) {
            // Don't fail package creation if notification fails
            console.error(
                "Failed to send package trip notification:",
                notificationError.response?.data || notificationError.message
            );
        }

        return res.status(201).json({
            success: true,
            message: "Package trip created successfully",
            data: savedTrip,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Failed to create package trip",
            error: error.message,
        });
    }
};

export const updatePackageTrip = async (req: any, res: any) => {
    try {
        const { id } = req.params;

        const updatedTrip = await PackageTrip.findByIdAndUpdate(
            id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        );

        if (!updatedTrip) {
            return res.status(404).json({
                success: false,
                message: "Package trip not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Package trip updated successfully",
            data: updatedTrip,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Failed to update package trip",
            error: error.message,
        });
    }
};

export const deletePackageTrip = async (req: any, res: any) => {
    try {
        const { id } = req.params;

        const deletedTrip = await PackageTrip.findByIdAndDelete(id);

        if (!deletedTrip) {
            return res.status(404).json({
                success: false,
                message: "Package trip not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Package trip deleted successfully",
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Failed to delete package trip",
            error: error.message,
        });
    }
};