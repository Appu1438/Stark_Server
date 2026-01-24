require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken";
import { nylas } from "../app";
import { driver, DriverWallet, Fare, Otp, Ride } from "../db/schema";
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
    console.log("🚪 [LOGOUT] Logout request received");

    try {
        const { driverId } = req.body;
        console.log("🆔 [LOGOUT] Driver ID:", driverId);

        // ------------------- Device Info -------------------
        const deviceHeader = req.headers["x-device-info"];

        if (!deviceHeader) {
            console.warn("⚠️ [LOGOUT] Device info header missing");
            return res.status(400).json({ message: "Device info missing." });
        }

        let deviceInfo: any;
        try {
            deviceInfo =
                typeof deviceHeader === "string"
                    ? JSON.parse(deviceHeader)
                    : deviceHeader;
        } catch (err) {
            console.error("❌ [LOGOUT] Invalid device info format", err);
            return res.status(400).json({ message: "Invalid device info format." });
        }

        const fingerprint = deviceInfo?.fingerprint;
        console.log("📱 [LOGOUT] Device Fingerprint:", fingerprint);

        if (!fingerprint) {
            console.warn("⚠️ [LOGOUT] Fingerprint missing in device info");
            return res.status(400).json({ message: "Fingerprint missing." });
        }

        // ------------------- Driver Lookup -------------------
        const existingDriver = await driver.findById(driverId);

        if (!existingDriver) {
            console.warn("❌ [LOGOUT] Driver not found:", driverId);
            return res.status(404).json({ message: "Driver not found." });
        }

        console.log("👤 [LOGOUT] Driver found:", {
            id: existingDriver._id,
            status: existingDriver.status,
            activeDeviceFingerprint: existingDriver.activeDevice?.fingerprint,
        });

        // ------------------- Device Match Check -------------------
        const isActiveDevice =
            existingDriver.activeDevice?.fingerprint === fingerprint;

        console.log(
            isActiveDevice
                ? "✅ [LOGOUT] Request from ACTIVE device"
                : "⚠️ [LOGOUT] Request from NON-ACTIVE device"
        );

        // =====================================================
        // 🔹 CASE 1: NON-ACTIVE DEVICE LOGOUT
        // =====================================================
        if (!isActiveDevice) {
            console.log(
                "🔐 [LOGOUT] Logging out session only (no status / socket / ride check)"
            );

            res.cookie("driverRefreshToken", "", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 0,
            });

            console.log("🍪 [LOGOUT] Refresh token cookie cleared");

            return res.status(200).json({
                success: true,
                message: "Session logged out from this device.",
                skipSocketCleanup: true,
            });
        }

        // =====================================================
        // 🔹 CASE 2: ACTIVE DEVICE → CHECK ACTIVE RIDE
        // =====================================================
        console.log("🚗 [LOGOUT] Checking for active ride...");

        const activeRide = await Ride.findOne({
            driverId,
            status: { $in: ["Booked", "Processing", "Arrived", "Ongoing", "Reached"] },
        });

        if (activeRide) {
            console.warn("🚫 [LOGOUT] Active ride found:", {
                rideId: activeRide._id,
                status: activeRide.status,
            });

            return res.status(423).json({
                success: false,
                blockLogout: true,
                message: "You can't logout while on a ride.",
            });
        }

        console.log("✅ [LOGOUT] No active ride found");

        // =====================================================
        // 🔹 CASE 3: ACTIVE DEVICE + NO RIDE → NORMAL LOGOUT
        // =====================================================
        console.log("📴 [LOGOUT] Updating driver status to INACTIVE");

        await driver.findByIdAndUpdate(driverId, {
            status: "inactive",
            lastActive: new Date(),
        });

        console.log("🕒 [LOGOUT] lastActive updated");

        res.cookie("driverRefreshToken", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 0,
        });

        console.log("🍪 [LOGOUT] Refresh token cookie cleared");
        console.log("✅ [LOGOUT] Driver logged out successfully");

        return res.status(200).json({
            success: true,
            message: "Driver logged out successfully.",
        });

    } catch (error) {
        console.error("🔥 [LOGOUT] Unexpected error during logout:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};



// sending otp to driver phone number
export const sendingOtpToPhone = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log("📲 [LOGIN OTP REQUEST] Started");

    try {
        const { phone_number } = req.body;

        // 1️⃣ Check driver exists
        const Driver = await driver.findOne({ phone_number });

        // 2️⃣ Check approval
        if (!Driver.is_approved) {
            return res.status(403).json({
                success: false,
                message: "Your account is not approved yet.",
            });
        }

        // 3️⃣ REVIEW MODE
        if (process.env.REVIEW_MODE === "true") {
            return res.status(200).json({
                success: true,
                message: "OTP sent (review mode)",
                reviewMode: true,
            });
        }

        // 4️⃣ Generate OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // remove old OTP if any
        await Otp.deleteMany({ phone_number });

        // save new OTP
        await Otp.create({
            phone_number,
            otp,
        });

        // 6️⃣ Send WhatsApp OTP
        await client.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER!, // +1XXXXXXXXXX (Twilio number)
            to: phone_number,                      // +91XXXXXXXXXX
            body: `Your Stark Driver OTP is ${otp}. It expires in 5 minutes.`,
        });

        console.log("✅ [LOGIN OTP REQUEST] WhatsApp OTP sent");

        res.status(200).json({ success: true });

    } catch (error) {
        console.error("🔥 [LOGIN OTP REQUEST] Error:", error);
        res.status(400).json({ success: false });
    }
};


// verifying otp for login
export const verifyPhoneOtpForLogin = async (req: Request, res: Response) => {
    console.log("🔑 [LOGIN OTP] Verification started");

    try {
        const { phone_number, otp } = req.body;

        const Driver = await driver.findOne({ phone_number });
        if (!Driver) {
            return res.status(404).json({
                success: false,
                message: "No account found please signup first.",
            });
        }

        if (!Driver.is_approved) {
            return res.status(403).json({
                success: false,
                message: "Your account is not approved yet.",
            });
        }

        // REVIEW MODE
        if (process.env.REVIEW_MODE === "true") {
            if (otp !== process.env.REVIEW_STATIC_OTP) {
                return res.status(400).json({ success: false, message: "Invalid OTP!" });
            }
        } else {

            const record = await Otp.findOne({
                phone_number,
                otp,
            });

            if (!record) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired OTP!",
                });
            }

            // delete after success
            await Otp.deleteMany({ phone_number });
        }

        // 📱 Device info (UNCHANGED)
        const deviceInfoHeader = req.headers["x-device-info"];
        if (deviceInfoHeader) {
            try {
                const deviceInfo = JSON.parse(deviceInfoHeader as string);

                Driver.activeDevice = {
                    fingerprint: deviceInfo.fingerprint,
                    brand: deviceInfo.brand,
                    model: deviceInfo.model,
                    osName: deviceInfo.osName,
                    osBuildId: deviceInfo.osBuildId,
                };

                await Driver.save();
            } catch (err) {
                console.error("❌ Device info parse error:", err);
            }
        }

        // 🔐 Tokens (UNCHANGED)
        const accessToken = generateAccessToken(Driver._id);
        const refreshToken = generateRefreshToken(Driver._id);

        res.cookie("driverRefreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            success: true,
            accessToken,
            driver: Driver,
        });

    } catch (error) {
        console.error("🔥 [LOGIN OTP] Unexpected error:", error);
        res.status(400).json({ success: false });
    }
};

// verifying phone otp for registration
export const verifyPhoneOtpForRegistration = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log("📝 [REGISTER OTP] Verification started");

    try {
        const { phone_number, otp } = req.body;

        if (process.env.REVIEW_MODE === "true") {
            if (otp !== process.env.REVIEW_STATIC_OTP) {
                return res.status(400).json({ success: false, message: "Invalid OTP!" });
            }

            return await sendingOtpToEmail(req, res);
        }

        const record = await Otp.findOne({
            phone_number,
            otp,
        });

        if (!record) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP!",
            });
        }

        // delete after success
        await Otp.deleteMany({ phone_number });

        await sendingOtpToEmail(req, res);

    } catch (error) {
        console.error("🔥 [REGISTER OTP] Unexpected error:", error);
        res.status(400).json({ success: false });
    }
};



// sending otp to email
export const sendingOtpToEmail = async (req: Request, res: Response) => {
    console.log("📧 [EMAIL OTP] Function called");

    try {
        console.log("📦 [EMAIL OTP] Request body received:", req.body);

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

        console.log("👤 [EMAIL OTP] Preparing OTP for:", email);

        // 🔥 REVIEW MODE — STATIC OTP
        const otp =
            process.env.REVIEW_MODE === "true"
                ? process.env.REVIEW_STATIC_OTP!
                : Math.floor(1000 + Math.random() * 9000).toString();

        console.log("🔐 [EMAIL OTP] OTP generated");

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

        console.log("📄 [EMAIL OTP] Driver payload prepared");

        const token = jwt.sign(
            { driver, otp },
            process.env.EMAIL_ACTIVATION_SECRET!,
            { expiresIn: "5m" }
        );

        console.log("🔏 [EMAIL OTP] JWT token generated (5 min expiry)");

        // 🔥 REVIEW MODE — SKIP EMAIL SENDING
        if (process.env.REVIEW_MODE === "true") {
            console.log("🧪 [EMAIL OTP] REVIEW_MODE — skipping email send");

            return res.status(201).json({
                success: true,
                reviewMode: true,
                token,
            });
        }

        const logoUrl =
            "https://res.cloudinary.com/starkcab/image/upload/v1765043362/App%20Logos/FullLogo_p0evhu.png";

        console.log("🎨 [EMAIL OTP] Preparing email template");

        const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>

  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #f4f4f7;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      width: 100%;
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }

    .header {
      padding: 30px 40px;
      text-align: center;
      background-color: #000000;
    }

    .logo {
      max-height: 40px;
    }

    .content {
      padding: 40px;
      color: #333333;
      line-height: 1.6;
    }

    .otp-block {
      background-color: #f0f2f5;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
      border: 1px dashed #ccc;
    }

    .otp-code {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #000000;
      margin: 0;
    }

    .footer {
      background-color: #f9f9f9;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #888888;
      border-top: 1px solid #eeeeee;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <img
        src="${logoUrl}"
        alt="Stark Logo"
        class="logo"
        style="display:block; margin:auto;"
      />
    </div>

    <div class="content">
      <h2 style="margin-top:0; font-weight:600; color:#111;">
        Verify your email address
      </h2>

      <p>Hi ${name},</p>

      <p>
        Thank you for joining <strong>Stark</strong>. To complete your
        registration, please verify your email address by entering the code
        below:
      </p>

      <div class="otp-block">
        <p class="otp-code">${otp}</p>
      </div>

      <p style="font-size:14px; color:#666;">
        This OTP is valid for <strong>5 minutes</strong>. If you did not request
        this verification, please disregard this email.
      </p>

      <p style="margin-top:30px;">
        Best regards,<br />
        <strong>The Stark Team</strong>
      </p>
    </div>

    <div class="footer">
      <p>
        &copy; ${new Date().getFullYear()} Stark OPC Pvt Ltd. All rights reserved.
      </p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
`;

        console.log("📨 [EMAIL OTP] Sending email via Nylas");

        await nylas.messages.send({
            identifier: process.env.USER_GRANT_ID!,
            requestBody: {
                to: [{ name, email }],
                subject: "Verify your email address - Stark",
                body: emailTemplate,
            },
        });

        console.log("✅ [EMAIL OTP] Email sent successfully");

        res.status(201).json({
            success: true,
            token,
        });

    } catch (error) {
        console.error("🔥 [EMAIL OTP] Unexpected error:", error);
    }
};


// verifying email otp and creating driver account
export const verifyingEmailOtp = async (req: Request, res: Response) => {
    console.log("✅ [EMAIL VERIFY] Function called");

    try {
        const { otp, token } = req.body;
        console.log("🔑 [EMAIL VERIFY] OTP & token received");

        const newDriver: any = jwt.verify(
            token,
            process.env.EMAIL_ACTIVATION_SECRET!
        );

        console.log("🔓 [EMAIL VERIFY] JWT verified successfully");

        // 🔥 REVIEW MODE — STATIC OTP CHECK
        if (process.env.REVIEW_MODE === "true") {
            if (otp !== process.env.REVIEW_STATIC_OTP) {
                return res.status(400).json({
                    success: false,
                    message: "OTP is not correct or expired!",
                });
            }
        } else {
            if (newDriver.otp !== otp) {
                console.warn("❌ [EMAIL VERIFY] OTP mismatch");

                return res.status(400).json({
                    success: false,
                    message: "OTP is not correct or expired!",
                });
            }
        }

        console.log("✅ [EMAIL VERIFY] OTP matched");

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

        console.log("🔍 [EMAIL VERIFY] Checking for duplicate driver");

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

        const parseDate = (value: string): Date | null => {
            if (!value) return null;

            const parts = value.split("-");
            if (parts.length === 3) {
                const [day, month, year] = parts.map(Number);
                return new Date(year, month - 1, day);
            }

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
        });

        await Driver.save();

        res.status(201).json({
            success: true,
            message:
                "Thank you for registering. Your account is being reviewed, and we will reach out soon.",
        });

    } catch (error) {
        console.error("🔥 [EMAIL VERIFY] JWT invalid or expired:", error);

        res.status(400).json({
            success: false,
            message: "Your OTP is expired or invalid!",
        });
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