require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken";
import { nylas } from "../app";
import { driver, DriverWallet, Fare, Ride } from "../db/schema";
import mongoose from "mongoose";

import { generateOtp } from "../utils/generateOtp";
import { calculateDistance } from "../utils/calculateDistance";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken, {
    lazyLoading: true,
});

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

/**
 * Refresh Token Controller
 */
export const refreshTokenDriver = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies.driverRefreshToken;
        console.log("🚘 [Driver Refresh] Step 1: Received refresh token:", refreshToken || "❌ No token found in cookies");

        if (!refreshToken) {
            console.log("🚫 [Driver Refresh] No refresh token found in cookies.");
            return res.status(401).json({ message: "Refresh token required" });
        }

        // Verify the refresh token 
        console.log("🔍 [Driver Refresh] Step 2: Verifying refresh token...");
        jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded: any) => {
            if (err) {

                console.log("🚫 [Driver Refresh] Token verification failed:", err.name);

                // ❗ Check ACTIVE RIDE if token is expired
                if (err.name === "TokenExpiredError") {
                    // ❗ Decode without verifying (works even when expired)
                    const decodedExpired: any = jwt.decode(refreshToken);

                    if (!decodedExpired || !decodedExpired.id) {
                        return res.status(403).json({ message: "Invalid refresh token" });
                    }

                    const Driver = await driver.findById(decodedExpired?.id);

                    if (!Driver) {
                        console.log("🚫 [Driver Refresh] Step 2.25: Driver not found for temp acces token.");

                        return res.status(403).json({ message: "Invalid refresh token" });
                    }

                    // 🔍 Check active ride
                    const activeRide = await Ride.findOne({
                        driverId: Driver._id,
                        status: { $in: ["Booked", "Processing", "Arrived", "Ongoing", "Reached"] },
                    });

                    if (activeRide) {
                        console.log("✅ [Driver Refresh] Step 2.5: Token verified failed. Generating Temp Token");
                        // 🔥 Give a short-lived backup token (10 minutes)
                        const tempAccessToken = generateAccessToken(Driver._id);

                        return res.json({
                            accessToken: tempAccessToken,
                            temp: true,
                            message: "Temporary access granted until the ride ends.",
                        });
                    }
                }

                return res.status(403).json({ message: "Invalid or expired refresh token" });
            }

            console.log("✅ [Driver Refresh] Step 3: Token verified successfully. Decoded payload:", decoded);
            // 🔥 Normal token refresh

            console.log("🔹 [Driver Refresh] Step 4: Searching driver with ID:", decoded.id);

            const Driver = await driver.findById(decoded.id);
            if (!Driver) {

                console.log("🚫 [Driver Refresh] Step 5: Driver not found or token invalidated.");
                return res.status(403).json({ message: "Refresh token invalid" });
            }

            console.log("✅ [Driver Refresh] Step 6: Driver found. Generating new access token...");
            const newAccessToken = generateAccessToken(Driver._id);

            console.log("✅ [Driver Refresh] Step 7: New access token generated successfully!");
            return res.json({ accessToken: newAccessToken, temp: false });
        });

    } catch (error) {
        console.error("Refresh error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};



/**
 * Logout Controller
 */
export const logoutDriver = async (req: Request, res: Response) => {
    const { driverId } = req.body;

    // ------------------- Validate Device Header -------------------
    const deviceHeader = req.headers["x-device-info"];
    if (!deviceHeader) {
        return res.status(400).json({ message: "Device info missing in request headers." });
    }

    let deviceInfo: any;
    try {
        deviceInfo = typeof deviceHeader === "string"
            ? JSON.parse(deviceHeader)
            : deviceHeader;
    } catch (err) {
        return res.status(400).json({ message: "Invalid device info format." });
    }

    const fingerprint = deviceInfo?.fingerprint;
    if (!fingerprint) {
        return res.status(400).json({ message: "Device fingerprint missing in device info." });
    }

    if (!driverId) {
        return res.status(400).json({ message: "Driver ID is required" });
    }

    try {
        // ------------------- Find Driver -------------------
        const existingDriver = await driver.findById(driverId);

        if (!existingDriver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        // ------------------- Device Mismatch Handling -------------------
        let updatedDriver = existingDriver;

        if (
            fingerprint &&
            existingDriver.activeDevice &&
            existingDriver.activeDevice.fingerprint === fingerprint
        ) {
            updatedDriver = await driver.findByIdAndUpdate(
                driverId,
                {
                    status: "inactive",
                    lastActive: new Date(),
                },
                { new: true }
            );
        }

        // ------------------- Clear Refresh Token Cookie -------------------
        res.cookie("driverRefreshToken", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 0,
        });

        // ------------------- Success Response -------------------
        return res.status(200).json({
            success: true,
            message:
                updatedDriver?.status === "inactive"
                    ? "Driver logged out successfully."
                    : "Driver session terminated on a different device.",
            driver: updatedDriver,
        });

    } catch (error) {
        console.error("Logout Error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


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
        // Step 4: Save device info
        const deviceInfoHeader = req.headers["x-device-info"];
        console.log(deviceInfoHeader)
        if (deviceInfoHeader) {
            try {
                // If it's sent as JSON string, parse it
                const deviceInfo = JSON.parse(deviceInfoHeader);
                console.log(deviceInfo)


                // Update the driver's activeDevice field
                Driver.activeDevice = {
                    fingerprint: deviceInfo.fingerprint,
                    brand: deviceInfo.brand,
                    model: deviceInfo.model,
                    osName: deviceInfo.osName,
                    osBuildId: deviceInfo.osBuildId,
                };

                await Driver.save();
            } catch (err) {
                console.error("Failed to save device info:", err);
            }
        }
        // Step 5: generate token
        const accessToken = generateAccessToken(Driver._id)
        const refreshToken = generateRefreshToken(Driver._id)

        res.cookie("driverRefreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // only over HTTPS in production
            sameSite: "strict",
            path: "/",
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });


        res.status(201).json({
            success: true,
            accessToken,
            driver: Driver,
        });
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
            capacity,
            profilePic
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
            capacity,
            profilePic
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
            capacity,
            profilePic
        } = newDriver.driver;

        const existingDriver = await driver.findOne({
            $or: [
                { email },
                { phone_number },
                { registration_number },
                { aadhar },
                { driving_license },
                { insurance_number }
            ],
        });


        if (existingDriver) {
            let message = "Duplicate entry detected!";

            if (existingDriver.email === email)
                message = "Email already registered!";
            else if (existingDriver.phone_number === phone_number)
                message = "Phone number already registered!";
            else if (existingDriver.registration_number === registration_number)
                message = "Registration number already exists!";
            else if (existingDriver.aadhar === aadhar)
                message = "Aadhar number already registered!";
            else if (existingDriver.driving_license === driving_license)
                message = "Driving license number already registered!";
            else if (existingDriver.insurance_number === insurance_number)
                message = "Insurance number already registered!";

            return res.status(409).json({ success: false, message });
        }

        // const typeUpper = vehicle_type.toUpperCase();

        // const baseFare = parseFloat(process.env[`BASEFARE_${typeUpper}`] || "0");
        // const perKmRate = parseFloat(process.env[`PERKM_${typeUpper}`] || "0");
        // const perMinRate = parseFloat(process.env[`PERMIN_${typeUpper}`] || "0");
        // const minFare = parseFloat(process.env[`MINFARE_${typeUpper}`] || "0");

        // if (!baseFare || !perKmRate || !perMinRate || !minFare) {
        //     return res.status(500).json({
        //         success: false,
        //         message: `Fare not fully configured for vehicle type: ${vehicle_type}`,
        //     });
        // }

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
            profilePic
            // baseFare,
            // perKmRate,
            // perMinRate,
            // minFare,
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

        // Check if driver exists
        const Driver = await driver.findById(req.driver.id);
        if (!Driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found",
            });
        }

        // ------------------------------
        // 🔥 Wallet Check: Only when going ONLINE
        // ------------------------------
        if (status === "active") {
            const driverWallet = await DriverWallet.findOne({ driverId: req.driver.id });

            if (!driverWallet || driverWallet.balance <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Your wallet balance is low. Please recharge your wallet to go online.",
                    code: "LOW_BALANCE",
                });
            }
        }

        // -------------------------------------
        // 🚫 Prevent status change during rides
        // -------------------------------------
        const activeRide = await Ride.findOne({
            driverId: req.driver.id,
            status: { $in: ["Processing", "Arrived", "Ongoing", "Reached"] },
        });

        if (activeRide) {
            return res.status(400).json({
                success: false,
                message: "You can't change your status while on an active ride.",
                code: "ACTIVE_RIDE",
            });
        }

        // -------------------------------------
        // ✅ Update online/offline status
        // -------------------------------------
        Driver.status = status;
        await Driver.save();

        const driverObj = Driver.toObject();
        driverObj.id = driverObj._id;
        delete driverObj._id;
        delete driverObj.__v;

        res.status(200).json({
            success: true,
            driver: driverObj,
        });

    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


//update notification token

export const updateDriverPushToken = async (req: any, res: Response) => {
    try {
        const { token } = req.body;
        console.log(token)

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




//find ride by Id
export const findRideById = async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log('driver', id)

    try {
        const ride = await Ride.findById(id)
            .populate("userId")
            .populate("driverId");

        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found" });
        }

        const { _id, ...rest } = ride.toObject();
        const formattedRide = { id: _id, ...rest };

        console.log(formattedRide)

        res.status(200).json({ success: true, ride: formattedRide });
    } catch (error) {
        console.error("Error fetching ride:", error);
        res.status(500).json({ success: false, message: "Error fetching ride" });
    }
};

// getting drivers rides
export const getAllRides = async (req: any, res: Response) => {
    const rides = await Ride.find({ driverId: req.driver.id }).populate("userId").populate("driverId");

    const formattedRides = rides.map((ride) => {
        const { _id, ...rest } = ride.toObject();
        return { id: _id, ...rest };
    });

    res.status(200).json({ success: true, rides: formattedRides });
};

export const getDriverEarnings = async (req, res) => {
  try {
    const driverId = req.driver?.id;
    const { period } = req.query;

    if (!driverId) {
      return res.status(400).json({ message: "Driver ID required" });
    }

    const objectId = new mongoose.Types.ObjectId(driverId);

    const now = new Date();

    // Choose group format
    let groupFormat;
    if (period === "daily") {
      groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    } else if (period === "weekly") {
      groupFormat = {
        $concat: [
          { $toString: { $isoWeek: "$createdAt" } },
          "-",
          { $toString: { $year: "$createdAt" } }
        ]
      };
    } else if (period === "monthly") {
      groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
    } else {
      return res.status(400).json({ message: "Invalid period" });
    }

    // 1️⃣ Fetch aggregated data
    const earnings = await Ride.aggregate([
      {
        $match: {
          driverId: objectId,
          $or: [
            { status: "Completed" },
            { status: "Cancelled", "cancelDetails.platformShare": { $gt: 0 } }
          ]
        }
      },

      {
        $addFields: {
          fareValue: {
            $cond: [
              { $eq: ["$status", "Completed"] },
              "$totalFare",
              "$cancelDetails.totalFare"
            ]
          },
          driverValue: {
            $cond: [
              { $eq: ["$status", "Completed"] },
              "$driverEarnings",
              "$cancelDetails.driverEarnings"
            ]
          },
          platformValue: {
            $cond: [
              { $eq: ["$status", "Completed"] },
              "$platformShare",
              "$cancelDetails.platformShare"
            ]
          }
        }
      },

      {
        $group: {
          _id: groupFormat,
          totalFare: { $sum: "$fareValue" },
          driverEarnings: { $sum: "$driverValue" },
          platformFee: { $sum: "$platformValue" },
          rideCount: { $sum: 1 }
        }
      },

      { $sort: { _id: 1 } }
    ]);

    // 2️⃣ Extract available keys from DB
    const keys = earnings.map(e => e._id);

    // 3️⃣ Generate clean chartData
    const chartData = earnings.map(item => ({
      label: period === "weekly" ? "W" + item._id : item._id,
      totalFare: item.totalFare,
      driverEarnings: item.driverEarnings,
      platformFee: item.platformFee,
      rideCount: item.rideCount,
    }));

    // 4️⃣ Compute totals
    const totalFare = chartData.reduce((a, b) => a + b.totalFare, 0);
    const totalDriver = chartData.reduce((a, b) => a + b.driverEarnings, 0);
    const totalPlatform = chartData.reduce((a, b) => a + b.platformFee, 0);
    const rideCount = chartData.reduce((a, b) => a + b.rideCount, 0);

    res.json({
      period,
      from: keys.length > 0 ? keys[0] : null,
      to: now,
      totalFare,
      driverEarnings: totalDriver,
      platformFee: totalPlatform,
      rideCount,
      chartData
    });

  } catch (err) {
    console.error("Earnings error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



// Helper: ISO week number
function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}