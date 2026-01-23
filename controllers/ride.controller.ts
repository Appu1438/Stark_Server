require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import { driver, DriverWallet, Fare, Ride, User } from "../db/schema";
import { generateOtp } from "../utils/generateOtp";
import { calculateDistance } from "../utils/calculateDistance";
import { sendPushNotification } from "../utils/sendNotification";
import { RideRequest } from "../db/schema";
import mongoose from "mongoose";

export const newRide = async (req: Request, res: Response) => {
    try {
        const {
            uniqueRideKey,
            userId,
            totalFare,
            driverEarnings,
            platformShare,
            status,
            currentLocationName,
            currentLocation,
            destinationLocationName,
            destinationLocation,
            distance,
        } = req.body;

        const driverId = req.driver.id;

        // =================================================
        // 1️⃣ LOCK RIDE REQUEST (pending → locked)
        // =================================================
        // Only ONE driver can do this successfully
        const lockedRequest = await RideRequest.findOneAndUpdate(
            {
                uniqueRideKey,
                status: "pending",
                expiresAt: { $gt: new Date() }, // must not be expired
            },
            {
                $set: {
                    status: "locked",
                    acceptedBy: new mongoose.Types.ObjectId(driverId),
                },
            },
            { new: true }
        );

        // ❌ Could not lock → check why
        if (!lockedRequest) {
            const existing = await RideRequest.findOne({ uniqueRideKey });

            // ⏱️ Expired
            if (!existing || existing.expiresAt <= new Date()) {
                return res.status(410).json({
                    success: false,
                    code: "REQUEST_EXPIRED",
                    message: "Ride request expired",
                });
            }

            // 🔒 Locked by another driver
            if (existing.status === "locked") {
                return res.status(423).json({
                    success: false,
                    code: "REQUEST_LOCKED",
                    message: "Ride is locked by another driver",
                });
            }

            // ✅ Already assigned
            if (existing.status === "assigned") {
                return res.status(409).json({
                    success: false,
                    code: "REQUEST_ASSIGNED",
                    message: "Ride already assigned to another driver",
                });
            }

            // Fallback
            return res.status(409).json({
                success: false,
                code: "REQUEST_UNAVAILABLE",
                message: "Ride unavailable",
            });
        }

        // =================================================
        // 2️⃣ WALLET CHECK (while locked)
        // =================================================
        const updatedWallet = await DriverWallet.findOneAndUpdate(
            {
                driverId,
                balance: { $gte: platformShare },
            },
            [
                {
                    $set: {
                        balance: { $subtract: ["$balance", platformShare] },
                        history: {
                            $concatArrays: [
                                "$history",
                                [
                                    {
                                        type: "debit",
                                        action: "platform_fee",
                                        amount: platformShare,
                                        referenceId: null,
                                        meta: {
                                            rideDetails: { totalFare, distance, userId },
                                        },
                                        balanceAfter: {
                                            $subtract: ["$balance", platformShare],
                                        },
                                        actionOn: new Date(),
                                    },
                                ],
                            ],
                        },
                    },
                },
            ],
            { new: true }
        );

        // ❌ Wallet failed → RELEASE LOCK
        if (!updatedWallet) {
            await RideRequest.updateOne(
                { _id: lockedRequest._id },
                { status: "pending", acceptedBy: null }
            );

            return res.status(400).json({
                success: false,
                code: "LOW_WALLET",
                message: "Insufficient wallet balance",
            });
        }

        // =================================================
        // 3️⃣ CREATE OTP
        // =================================================
        const otp = await generateOtp();

        // =================================================
        // 4️⃣ CREATE RIDE (WINNER)
        // =================================================
        const newRide = await Ride.create({
            uniqueRideKey,
            userId,
            driverId,
            totalFare: Number(totalFare),
            driverEarnings: Number(driverEarnings),
            platformShare: Number(platformShare),
            status,
            currentLocationName,
            currentLocation,
            destinationLocationName,
            destinationLocation,
            distance,
            otp,
        });

        // =================================================
        // 5️⃣ FINALIZE REQUEST (locked → assigned)
        // =================================================
        await RideRequest.updateOne(
            { _id: lockedRequest._id },
            { status: "assigned" }
        );

        await driver.findByIdAndUpdate(driverId, {
            $inc: { pendingRides: 1 },
        });

        await User.findByIdAndUpdate(userId, {
            $inc: { pendingRides: 1 },
        });

        // =================================================
        // 6️⃣ SUCCESS RESPONSE
        // =================================================
        return res.status(201).json({
            success: true,
            newRide: {
                id: newRide._id,
                uniqueRideKey,
                userId: newRide.userId,
                driverId: newRide.driverId,
                totalFare: newRide.totalFare,
                driverEarnings: newRide.driverEarnings,
                platformShare: newRide.platformShare,
                status: newRide.status,
                otp: newRide.otp,
                currentLocationName: newRide.currentLocationName,
                destinationLocationName: newRide.destinationLocationName,
                distance: newRide.distance,
                createdAt: newRide.createdAt,
                updatedAt: newRide.updatedAt,
            },
            walletBalance: updatedWallet.balance,
        });

    } catch (error: any) {
        console.error("New Ride Error:", error);

        // 🧨 Unique ride key conflict (extreme edge case)
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                code: "REQUEST_ASSIGNED",
                message: "Ride already assigned",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};



export const verifyRideOtp = async (req: Request, res: Response) => {
    try {
        const { rideId, otp } = req.body;

        if (!rideId || !otp) {
            return res.status(400).json({ message: "rideId and otp are required" });
        }

        // Find the ride
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Check if ride already started
        if (ride.status === "Ongoing") {
            return res.status(400).json({ message: "Ride is already started" });
        }

        // Verify OTP
        if (ride.otp !== parseInt(otp)) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // Update status to Ongoing
        ride.status = "Ongoing";
        await ride.save();

        res.status(200).json({
            success: true,
            message: "OTP verified successfully. Ride started!",
            updatedRide: ride,
        });
    } catch (error) {
        console.error("OTP Verification Error:", error);
        res.status(500).json({ message: "Internal server error", error });
    }
};

// updating ride status
export const updatingRideStatus = async (req: any, res: Response) => {
    try {
        const { rideId, rideStatus, driverLocation } = req.body;
        console.log(req.body)

        if (!rideId || !rideStatus) {
            return res.status(400).json({ success: false, message: "Invalid input data" });
        }

        const driverId = req.driver?.id;
        if (!driverId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const ride = await Ride.findById(rideId);

        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found" });
        }

        // Check for proximity before updating status
        if (rideStatus === "Arrived") {
            const distanceToPickup = calculateDistance(
                driverLocation.latitude,
                driverLocation.longitude,
                ride?.currentLocation?.latitude,
                ride?.currentLocation?.longitude
            );

            if (distanceToPickup > 1) {
                return res.status(400).json({
                    message: "You must be within 1 km of the pickup location to mark as Arrived",
                });
            }
        }

        if (rideStatus === "Reached") {
            const distanceToDrop = calculateDistance(
                driverLocation.latitude,
                driverLocation.longitude,
                ride?.destinationLocation?.latitude,
                ride?.destinationLocation?.longitude
            );

            if (distanceToDrop > 1) {
                return res.status(400).json({
                    message: "You must be within 1 km of the destination to mark as Reached",
                });
            }
        }

        ride.status = rideStatus;
        await ride.save();

        if (rideStatus === "Completed") {

            // Update driver ride stats
            await driver.updateOne(
                { _id: driverId },
                [
                    {
                        $set: {
                            pendingRides: {
                                $cond: [
                                    { $gt: ["$pendingRides", 0] },
                                    { $subtract: ["$pendingRides", 1] },
                                    0
                                ]
                            },
                            totalEarning: { $add: ["$totalEarning", ride.totalFare] },
                            totalRides: { $add: ["$totalRides", 1] },
                            totalShare: { $add: ["$totalShare", ride.platformShare] },
                        }
                    }
                ]
            );

            // Update user stats
            await User.updateOne(
                { _id: ride.userId },
                [
                    {
                        $set: {
                            pendingRides: {
                                $cond: [
                                    { $gt: ["$pendingRides", 0] },
                                    { $subtract: ["$pendingRides", 1] },
                                    0
                                ]
                            },
                            totalRides: { $add: ["$totalRides", 1] },
                        }
                    }
                ]
            );

            // ---------------------------------------
            //  🚨 HANDLE PENDING SUSPENSION AFTER RIDE
            // ---------------------------------------
            const DriverData = await driver.findById(driverId);

            if (DriverData?.pending_suspension) {
                DriverData.is_approved = false;     // suspend
                DriverData.pending_suspension = false; // clear flag
                await DriverData.save();

                console.log("🚨 Driver suspended after ride completion:", driverId);

                // OPTIONAL: Send push notification
                if (DriverData.notificationToken) {
                    sendPushNotification(
                        DriverData.notificationToken,
                        "Account Suspended",
                        "Your account has been suspended. Contact support for more info."
                    );
                }
            }
        }


        res.status(201).json({
            success: true,
            updatedRide: {
                id: ride._id, // map _id to id
                userId: ride.userId,
                driverId: ride.driverId,
                totalFare: ride.totalFare,
                driverEarnings: ride.driverEarnings,
                platformShare: ride.platformShare,
                status: ride.status,
                currentLocationName: ride.currentLocationName,
                destinationLocationName: ride.destinationLocationName,
                distance: ride.distance,
                createdAt: ride.createdAt,
                updatedAt: ride.updatedAt,
            },
        });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};


export const cancelRide = async (req: any, res: Response) => {
    try {
        const { rideId, fare = 0, distanceTravelled = 0, location, cancelledLocationName } = req.body;
        const userId = req.user.id;

        console.log(req.body, userId)

        const ride = await Ride.findById(rideId)
            .populate("userId")
            .populate("driverId");
        if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
        if (ride.userId._id.toString() !== userId)
            return res.status(403).json({ success: false, message: "Not authorized" });
        if (ride.status === "Completed") return res.status(400).json({ success: false, message: "Cannot cancel a completed ride" });

        const driverId = ride.driverId;

        console.log(driverId)

        // // Update ride status
        ride.status = "Cancelled";
        // ride.status = ride.status === "Ongoing" ? "Cancelled-Midway" : "Cancelled";

        // // Update cancelDetails
        ride.cancelDetails = {
            cancelledBy: "user",
            totalFare: fare.totalFare,
            driverEarnings: fare.driverEarnings,
            platformShare: fare.platformShare,
            refundedAmount: ride.platformShare - fare.platformShare,
            travelledDistance: distanceTravelled,
            cancelledLocationName: cancelledLocationName,
            cancelledLocation: location ? location : null,
            cancelledAt: new Date(),
        };

        await ride.save();

        await driver.updateOne(
            { _id: driverId },
            [
                {
                    $set: {
                        pendingRides: {
                            $cond: [
                                { $gt: ["$pendingRides", 0] },
                                { $subtract: ["$pendingRides", 1] },
                                0,
                            ],
                        },
                        cancelRides: { $add: ["$cancelRides", 1] },
                        totalEarning: { $add: ["$totalEarning", fare.totalFare] },
                        totalShare: { $add: ["$totalShare", fare.platformShare] },
                    },

                },
            ]
        );
        await User.updateOne(
            { _id: userId },
            [
                {
                    $set: {
                        pendingRides: {
                            $cond: [
                                { $gt: ["$pendingRides", 0] },
                                { $subtract: ["$pendingRides", 1] },
                                0
                            ]
                        },
                        cancelRides: { $add: ["$cancelRides", 1] }
                    }
                }
            ]
        );

        // // Refund wallet to driver (platform share minus penalty)
        const updatedWallet = await DriverWallet.findOneAndUpdate(
            { driverId },
            [
                {
                    $set: {
                        balance: { $add: ["$balance", ride.platformShare - fare.platformShare] },
                        history: {
                            $concatArrays: [
                                "$history",
                                [
                                    {
                                        type: "credit",
                                        action: "refund",
                                        amount: ride.platformShare - fare.platformShare,
                                        referenceId: ride._id,
                                        meta: { rideDetails: { totalFare: ride.totalFare, distance: ride.distance, userId } },
                                        balanceAfter: { $add: ["$balance", ride.platformShare - fare.platformShare] },
                                        actionOn: new Date(),
                                    },
                                ],
                            ],
                        },
                    },
                },
            ],
            { new: true }
        );

        const { _id, ...rest } = ride.toObject();
        const formattedRide = { id: _id, ...rest };

        res.status(200).json({
            success: true,
            message: "Ride cancelled successfully",
            updatedRide: formattedRide,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error?.message });
    }
};


export const ratingDriver = async (req: Request, res: Response) => {
    try {
        const { rating, rideId } = req.body;
        console.log("⭐ Driver Rating received:", req.body);

        if (!rating || !rideId) {
            console.log("Missing fields");
            return res.status(400).json({ message: "Missing fields" });
        }

        // Find the ride and driver
        const ride = await Ride.findById(rideId).populate("driverId");
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Prevent duplicate rating
        if (ride.driverRating && ride.driverRating > 0) {
            return res.status(400).json({ message: "Driver already rated for this ride." });
        }

        // Save driver's rating
        ride.driverRating = rating;

        // ✅ Calculate average rating (driverRating + userRating) / 2
        if (ride.userRating) {
            ride.rating = Number(((ride.driverRating + ride.userRating) / 2).toFixed(2));
        } else {
            ride.rating = ride.driverRating; // if only one available
        }

        await ride.save();

        // ✅ Update driver's average rating & total ratings
        if (ride.driverId) {
            const Driver = await driver.findById(ride.driverId._id || ride.driverId);
            if (Driver) {
                const totalRidesRated = Driver.totalRatings || 0;
                const currentAverage = Driver.ratings || 0;

                const newAverage =
                    (currentAverage * totalRidesRated + rating) / (totalRidesRated + 1);

                Driver.totalRatings = totalRidesRated + 1;
                Driver.ratings = Number(newAverage.toFixed(2));
                await Driver.save();

                console.log(`✅ Updated driver ${Driver.name}: avg=${Driver.ratings}, total=${Driver.totalRatings}`);
            }
        }

        const updatedRide = await Ride.findById(rideId).populate("driverId");

        return res.status(200).json({
            message: "Driver rating submitted successfully",
            updatedRide,
        });
    } catch (error) {
        console.error("❌ Error submitting driver rating:", error);
        return res.status(500).json({ message: "Server error", error });
    }
};

export const ratingUser = async (req: Request, res: Response) => {
    try {
        const { rating, rideId } = req.body;
        console.log("⭐ User Rating received:", req.body);

        if (!rating || !rideId) {
            console.log("Missing fields");
            return res.status(400).json({ message: "Missing fields" });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Prevent duplicate rating
        if (ride.userRating && ride.userRating > 0) {
            return res.status(400).json({ message: "User already rated for this ride." });
        }

        // Save user's rating
        ride.userRating = rating;

        // ✅ Calculate average rating (driverRating + userRating) / 2
        if (ride.driverRating) {
            ride.rating = Number(((ride.driverRating + ride.userRating) / 2).toFixed(2));
        } else {
            ride.rating = ride.userRating; // if only one available
        }

        await ride.save();

        // ✅ Update user’s average rating
        if (ride.userId) {
            const user = await User.findById(ride.userId._id || ride.userId);
            if (user) {
                const totalRidesRated = user.totalRatings || 0;
                const currentAverage = user.ratings || 0;

                const newAverage =
                    (currentAverage * totalRidesRated + rating) / (totalRidesRated + 1);

                user.totalRatings = totalRidesRated + 1;
                user.ratings = Number(newAverage.toFixed(2));
                await user.save();

                console.log(`✅ Updated user ${user.name}: avg=${user.ratings}, total=${user.totalRatings}`);
            }
        }

        const updatedRide = await Ride.findById(rideId).populate("userId");

        return res.status(200).json({
            message: "User rating submitted successfully",
            updatedRide,
        });
    } catch (error) {
        console.error("❌ Error submitting user rating:", error);
        return res.status(500).json({ message: "Server error", error });
    }
};

