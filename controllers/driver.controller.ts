require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken, sendToken } from "../utils/generateToken";
import { nylas } from "../app";
import { driver, DriverWallet, Fare, Ride } from "../db/schema";
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
        const refreshToken = req.cookies.refreshToken;
        console.log('Refresh Token Driver ', refreshToken)

        if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

        // Verify token
        jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
            if (err) return res.status(403).json({ message: "Invalid or expired refresh token" });

            const Driver = await driver.findById(decoded.id);
            if (!Driver) {
                return res.status(403).json({ message: "Refresh token not found or already invalidated" });
            }

            // Generate new access token
            const newAccessToken = generateAccessToken(Driver._id);

            return res.json({ accessToken: newAccessToken });
        });
    } catch (error) {
        console.error("Refresh Token Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Logout Controller
 */
export const logoutDriver = async (req: Request, res: Response) => {
    const { driverId } = req.body;
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
    if (!driverId) {
        return res.status(400).json({ message: "Driver ID is required" });
    }

    try {
        // 1️⃣ Find driver first
        const existingDriver = await driver.findById(driverId);

        if (!existingDriver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        let updatedDriver = existingDriver;

        // 2️⃣ Only update status if device matches
        if (
            fingerprint &&
            existingDriver.activeDevice &&
            existingDriver.activeDevice.fingerprint === fingerprint
        ) {
            updatedDriver = await driver.findByIdAndUpdate(
                driverId,
                { status: "inactive" },
                { new: true }
            );
        }

        // 3️⃣ Clear refresh token cookie
        res.cookie("refreshToken", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 0,
        });

        // 4️⃣ Respond success
        return res.status(200).json({
            success: true,
            message:
                updatedDriver?.status === "inactive"
                    ? "Driver logged out successfully"
                    : "Driver session terminated (different device)",
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

        res.cookie("refreshToken", refreshToken, {
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

        const existingDriver = await driver.findOne({
            $or: [
                { email },
                { phone_number },
                { registration_number }
            ],
        });

        if (existingDriver) {
            let message = "Duplicate entry detected!";
            if (existingDriver.email === email) message = "Email already registered!";
            else if (existingDriver.phone_number === phone_number) message = "Phone number already registered!";
            else if (existingDriver.registration_number === registration_number) message = "Registration number already exists!";

            return res.status(409).json({ success: false, message });
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


export const newRide = async (req: any, res: Response) => {
    try {
        const {
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

        // console.log(req.body)

        const driverId = req.driver.id;

        // ✅ Check wallet balance and deduct platform share atomically
        const updatedWallet = await DriverWallet.findOneAndUpdate(
            {
                driverId,
                balance: { $gt: 0 }, // ensure wallet balance is greater than 0
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
                                        referenceId: null, // optional, you can put ride ID after ride is created
                                        meta: { rideDetails: { totalFare, distance, userId } },
                                        balanceAfter: { $subtract: ["$balance", platformShare] },
                                        actionOn: new Date(),
                                    },
                                ],
                            ],
                        },
                    },
                },
            ],
            { new: true } // return the updated wallet
        );

        if (!updatedWallet) {
            return res
                .status(400)
                .json({ message: "Insufficient wallet balance to start the ride" });
        }

        // ✅ Create the ride
        const newRide = new Ride({
            userId,
            driverId,
            totalFare: parseFloat(totalFare),
            driverEarnings: parseFloat(driverEarnings),
            platformShare: parseFloat(platformShare),
            status,
            currentLocationName,
            currentLocation,
            destinationLocationName,
            destinationLocation,
            distance,
        });

        await newRide.save();

        // ✅ Optionally, update the history with the ride ID reference
        await DriverWallet.updateOne(
            { driverId },
            {
                $set: {
                    "history.$[elem].referenceId": newRide._id,
                },
            },
            { arrayFilters: [{ "elem.action": "platform_fee", "elem.referenceId": null }] }
        );

        await driver.findByIdAndUpdate(driverId, {
            $inc: { pendingRides: 1 },
        });

        res.status(201).json({
            success: true,
            newRide: {
                id: newRide._id, // map _id to id
                userId: newRide.userId,
                driverId: newRide.driverId,
                totalFare: newRide.totalFare,
                driverEarnings: newRide.driverEarnings,
                platformShare: newRide.platformShare,
                status: newRide.status,
                currentLocationName: newRide.currentLocationName,
                destinationLocationName: newRide.destinationLocationName,
                distance: newRide.distance,
                createdAt: newRide.createdAt,
                updatedAt: newRide.updatedAt,
            },
            walletBalance: updatedWallet.balance,
        });
    } catch (error) {
        console.error("New Ride Error:", error);
        res.status(500).json({ message: "Internal server error", error });
    }
};


// updating ride status
export const updatingRideStatus = async (req: any, res: Response) => {
    try {
        const { rideId, rideStatus } = req.body;
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

        ride.status = rideStatus;
        await ride.save();

        if (rideStatus === "Completed") {
            await driver.updateOne(
                { _id: driverId },
                [
                    {
                        $set: {
                            pendingRides: {
                                $cond: [{ $gt: ["$pendingRides", 0] }, { $subtract: ["$pendingRides", 1] }, 0]
                            },
                            totalEarning: { $add: ["$totalEarning", ride.totalFare] },
                            totalRides: { $add: ["$totalRides", 1] },
                            totalShare: { $add: ["$totalShare", ride.platformShare] },
                        }
                    }
                ]
            );

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

//find ride by Id
export const findRideById = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const ride = await Ride.findById(id)
            .populate("userId")
            .populate("driverId");

        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found" });
        }

        const { _id, ...rest } = ride.toObject();
        const formattedRide = { id: _id, ...rest };

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


