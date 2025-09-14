require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import prisma from "../utils/prisma";
import jwt from "jsonwebtoken";
import { sendToken } from "../utils/send-token";
import { nylas } from "../app";
import { driver, DriverWallet, Ride } from "../db/schema";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken, {
    lazyLoading: true,
});

// sending otp to driver phone number
export const sendingOtpToPhone = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { phone_number } = req.body;
        console.log(phone_number);
        try {
            await client.verify.v2
                ?.services(process.env.TWILIO_SERVICE_SID!)
                .verifications.create({
                    channel: "sms",
                    to: phone_number,
                });

            res.status(201).json({
                success: true,
            });
        } catch (error) {
            console.log(error);
            res.status(400).json({
                success: false,
            });
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({
            success: false,
        });
    }
};

// verifying otp for login
export const verifyPhoneOtpForLogin = async (req: Request, res: Response) => {
    try {
        const { phone_number, otp } = req.body;

        // Step 1: Check if driver exists
        const Driver = await driver.findOne({ phone_number });

        if (!Driver) {
            return res.status(404).json({
                success: false,
                message: "No account found with this phone number.",
            });
        }

        // Step 2: Check if approved
        if (!Driver.is_approved) {
            return res.status(403).json({
                success: false,
                message: "Your account is not approved yet. Please wait for our approval.",
            });
        }

        // Step 3: Verify OTP
        const verification = await client.verify.v2
            .services(process.env.TWILIO_SERVICE_SID!)
            .verificationChecks.create({ to: phone_number, code: otp });

        if (verification.status !== "approved") {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
        }

        // Step 4: Send token
        sendToken(Driver, res);
    } catch (error) {
        console.error(error);
        res.status(400).json({ success: false, message: "Something went wrong!" });
    }
};


// verifying phone otp for registration
export const verifyPhoneOtpForRegistration = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { phone_number, otp } = req.body;

        try {
            await client.verify.v2
                .services(process.env.TWILIO_SERVICE_SID!)
                .verificationChecks.create({
                    to: phone_number,
                    code: otp,
                });

            await sendingOtpToEmail(req, res);
        } catch (error) {
            console.log(error);
            res.status(400).json({
                success: false,
                message: "Something went wrong!",
            });
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({
            success: false,
        });
    }
};

// sending otp to email
export const sendingOtpToEmail = async (req: Request, res: Response) => {
    try {
        console.log(req.body)
        const {
            name,
            country,
            phone_number,
            email,
            dob,
            gender,
            address,
            city,
            aadhar,
            vehicle_type,
            registration_number,
            registration_date,
            driving_license,
            license_expiry,
            insurance_number,
            insurance_expiry,
            vehicle_color,
            capacity
        } = req.body;


        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        const driver = {
            name,
            country,
            phone_number,
            email,
            dob,
            gender,
            address,
            city,
            aadhar,
            vehicle_type,
            registration_number,
            registration_date,
            driving_license,
            license_expiry,
            insurance_number,
            insurance_expiry,
            vehicle_color,
            capacity
        };
        const token = jwt.sign(
            {
                driver,
                otp,
            },
            process.env.EMAIL_ACTIVATION_SECRET!,
            {
                expiresIn: "5m",
            }
        );
        try {
            await nylas.messages.send({
                identifier: process.env.USER_GRANT_ID!,
                requestBody: {
                    to: [{ name: name, email: email }],
                    subject: "Verify your email address!",
                    body: `
            <p>Hi ${name},</p>
        <p>Your Stark verification code is ${otp}. If you didn't request for this OTP, please ignore this email!</p>
        <p>Thanks,<br>Stark Team</p>
            `,
                },
            });
            res.status(201).json({
                success: true,
                token,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
            console.log(error);
        }
    } catch (error) {
        console.log(error);
    }
};

// verifying email otp and creating driver account
export const verifyingEmailOtp = async (req: Request, res: Response) => {
    try {
        const { otp, token } = req.body;

        const newDriver: any = jwt.verify(token, process.env.EMAIL_ACTIVATION_SECRET!);

        if (newDriver.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: "OTP is not correct or expired!",
            });
        }

        const {
            name,
            country,
            phone_number,
            email,
            dob,
            gender,
            address,
            city,
            aadhar,
            vehicle_type,
            registration_number,
            registration_date,
            driving_license,
            license_expiry,
            insurance_number,
            insurance_expiry,
            vehicle_color,
            capacity
        } = newDriver.driver;

        // Check if already exists
        const existingDriver = await driver.findOne({
            $or: [{ email }, { phone_number }],
        });

        if (existingDriver) {
            return res.status(409).json({
                success: false,
                message: existingDriver.email === email
                    ? "Email already registered!"
                    : "Phone number already registered!",
            });
        }

        const typeUpper = vehicle_type.toUpperCase();

        const baseFare = parseFloat(process.env[`BASEFARE_${typeUpper}`] || "0");
        const perKmRate = parseFloat(process.env[`PERKM_${typeUpper}`] || "0");
        const perMinRate = parseFloat(process.env[`PERMIN_${typeUpper}`] || "0");
        const minFare = parseFloat(process.env[`MINFARE_${typeUpper}`] || "0");

        if (!baseFare || !perKmRate || !perMinRate || !minFare) {
            return res.status(500).json({
                success: false,
                message: `Fare not fully configured for vehicle type: ${vehicle_type}`,
            });
        }

        // 🔑 Convert string -> Date objects safely
        // 🔑 Helper function
        // Convert DD-MM-YYYY -> Date object (ISO format in MongoDB)
        const parseDate = (value: string): Date | null => {
            if (!value) return null;

            const parts = value.split("-");
            if (parts.length === 3) {
                const [day, month, year] = parts.map(Number);
                // ✅ construct as Date(year, month-1, day) → automatically stores ISO
                // return new Date(Date.UTC(year, month - 1, day));

                return new Date(year, month - 1, day);
            }

            // fallback for already ISO-like formats
            const parsed = new Date(value);
            return isNaN(parsed.getTime()) ? null : parsed;
        };



        const Driver = new driver({
            name,
            email,
            phone_number,
            country,
            city,
            address,
            aadhar,
            dob: parseDate(dob),
            gender,
            vehicle_type,
            registration_number,
            registration_date: parseDate(registration_date),
            driving_license,
            license_expiry: parseDate(license_expiry),
            insurance_number,
            insurance_expiry: parseDate(insurance_expiry),
            vehicle_color,
            capacity,
            baseFare,
            perKmRate,
            perMinRate,
            minFare,
        });

        await Driver.save();

        res.status(201).json({
            success: true,
            message: "Thank you for registering. Your account is being reviewed, and we will reach out soon.",
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ success: false, message: "Your OTP is expired or invalid!" });
    }
};



// get logged in driver data
export const getLoggedInDriverData = async (req: any, res: Response) => {
    try {
        const driverDoc = req.driver.toObject ? req.driver.toObject() : req.driver;

        const driver = {
            ...driverDoc,
            id: driverDoc._id,
        };
        delete driver._id; // remove original _id if you don’t want to expose it
        delete driver.__v; // optional: remove mongoose version key

        res.status(200).json({
            success: true,
            driver,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


export const getDriverWallet = async (req: Request, res: Response) => {
    try {
        const driverId = req.driver?.id || req.driver?._id; // depends on your auth middleware

        if (!driverId) {
            return res.status(401).json({ message: "Unauthorized: Driver not found" });
        }

        // ✅ Find wallet (or create empty wallet if not found)
        let wallet = await DriverWallet.findOne({ driverId });

        if (!wallet) {
            // Create a wallet if not found (optional, depends on your business logic)
            wallet = await DriverWallet.create({ driverId, balance: 0, history: [] });
        }

        return res.status(200).json({
            success: true,
            wallet: {
                balance: wallet.balance,
                history: wallet.history,
            },
        });
    } catch (error) {
        console.error("Error fetching driver wallet:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch wallet details",
            error,
        });
    }
};
// updating driver status
export const updateDriverStatus = async (req: any, res: Response) => {
    try {
        const { status } = req.body;

        console.log(status);

        let Driver = await driver.findByIdAndUpdate(
            req.driver.id,
            { status },
            { new: true }
        );

        if (!Driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        // Convert Mongoose doc to plain object
        const driverObj = Driver.toObject();

        // Remap _id → id
        driverObj.id = driverObj._id;
        delete driverObj._id;
        delete driverObj.__v;

        res.status(200).json({ success: true, driver: driverObj });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};


//update notification token

export const updateDriverPushToken = async (req: any, res: Response) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ message: "Push token is required" });
        }

        const updatedDriver = await driver.findByIdAndUpdate(
            req.driver.id,
            { notificationToken: token },
            { new: true }
        );

        res.status(200).json({
            message: "Push token updated successfully",
            driver: updatedDriver,
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};


// get drivers data with id
export const getDriversById = async (req: Request, res: Response) => {
    try {
        const { ids } = req.query as any;

        if (!ids) {
            return res.status(400).json({ message: "No driver IDs provided" });
        }

        const driverIds = ids.split(",");

        const drivers = await driver.find({ _id: { $in: driverIds } }).lean();

        const formattedDrivers = drivers.map(({ _id, ...rest }) => ({
            id: _id.toString(),
            ...rest,
        }));

        res.json(formattedDrivers);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};


// creating new ride
export const newRide = async (req: any, res: Response) => {
    try {
        const {
            userId,
            totalFare,
            driverEarnings,
            platformShare,
            status,
            currentLocationName,
            destinationLocationName,
            distance,
        } = req.body;

        const newRide = new Ride({
            userId,
            driverId: req.driver.id,
            totalFare: parseFloat(totalFare),
            driverEarnings: parseFloat(driverEarnings),
            platformShare: parseFloat(platformShare),
            status,
            currentLocationName,
            destinationLocationName,
            distance,
        });

        await newRide.save();

        res.status(201).json({ success: true, newRide });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};


// updating ride status
export const updatingRideStatus = async (req: any, res: Response) => {
    try {
        const { rideId, rideStatus } = req.body;

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

        ride.status = rideStatus;
        await ride.save();

        if (rideStatus === "Completed") {
            await driver.findByIdAndUpdate(driverId, {
                $inc: { totalEarning: ride.totalFare, totalRides: 1 },
            });
        }

        res.status(201).json({ success: true, updatedRide: ride });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// getting drivers rides
export const getAllRides = async (req: any, res: Response) => {
    const rides = await Ride.find({ driverId: req.driver?.id })
        .populate("driverId")
        .populate("userId");

    res.status(201).json({ rides });
};
