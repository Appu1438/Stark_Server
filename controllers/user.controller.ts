require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { client, nylas } from "../app";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken";
import { Fare, Otp, Ride, RideRequest, User } from "../db/schema";
import mongoose from "mongoose";
import { isValidPhoneNumber } from "../utils/validatePhoneNumber";
import { hashOtp } from "../utils/hashOtp";



const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

/**
 * Refresh Token Controller
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.userRefreshToken;
    console.log("🔹 Step 1: Received refresh token:", refreshToken || "❌ No token in cookies");

    // Check for token presence
    if (!refreshToken) {
      console.log("🚫 No refresh token found in cookies.");
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Verify token
    console.log("🔹 Step 2: Verifying refresh token...");
    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded: any) => {
      if (err) {
        console.log("🚫 Token verification failed:", err.message);
        return res.status(403).json({ message: "Invalid or expired refresh token" });
      }

      console.log("✅ Step 3: Token verified successfully. Decoded payload:", decoded);

      // Find user
      console.log("🔹 Step 4: Searching for user with ID:", decoded.id);
      const user = await User.findById(decoded.id);

      if (!user) {
        console.log("🚫 Step 5: No user found with this ID or token invalidated.");
        return res.status(403).json({ message: "Refresh token not found or already invalidated" });
      }

      // Generate new access token
      console.log("✅ Step 6: User found. Generating new access token...");
      const newAccessToken = generateAccessToken(user._id);
      console.log("✅ Step 7: New Access Token generated successfully!");

      return res.json({ accessToken: newAccessToken });
    });
  } catch (error) {
    console.error("🔥 Step 8: Unhandled error in refreshToken:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Logout Controller
 */
export const logout = async (req: Request, res: Response) => {
  try {
    console.log('Logging Out User')
    // Clear the refresh token cookie
    res.cookie("userRefreshToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only over HTTPS in prod
      sameSite: "strict",
      maxAge: 0, // expire immediately
    });

    res.json({ message: "Refresh token cleared successfully" });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



// 📌 Register new user (Send OTP via WhatsApp)
export const registerUser = async (req: Request, res: Response) => {
  const requestId = Date.now();
  console.log(`\n📥 [REGISTER][${requestId}] Request received`);
  console.log(`📱 [REGISTER][${requestId}] Payload:`, req.body);

  try {
    const { phone_number } = req.body;

    /* ---------------- PHONE VALIDATION ---------------- */
    if (!phone_number || !isValidPhoneNumber(phone_number)) {
      console.warn(`❌ [REGISTER][${requestId}] Invalid phone number`, phone_number);
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
      });
    }

    /* ---------------- REVIEW MODE ---------------- */
    if (process.env.REVIEW_MODE === "true") {
      console.log(`🧪 [REGISTER][${requestId}] Review mode`);
      return res.status(200).json({
        success: true,
        message: "OTP sent (review mode)",
        reviewMode: true,
      });
    }

    /* ---------------- COOLDOWN (60s) ---------------- */
    const recentOtp = await Otp.findOne({
      phone_number,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
    });

    if (recentOtp) {
      console.warn(`⏱️ [REGISTER][${requestId}] Cooldown hit`);
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP",
      });
    }

    /* ---------------- DAILY LIMIT (5/day) ---------------- */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sentToday = await Otp.countDocuments({
      phone_number,
      createdAt: { $gte: today },
    });

    console.log(`📊 [REGISTER][${requestId}] OTPs today:`, sentToday);

    if (sentToday >= 5) {
      console.warn(`🚫 [REGISTER][${requestId}] Daily limit reached`);
      return res.status(429).json({
        success: false,
        message: "Daily OTP limit reached",
      });
    }

    /* ---------------- GENERATE OTP ---------------- */
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const hashedOtp = hashOtp(otp);

    await Otp.create({
      phone_number,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min validity

    });

    console.log(`💾 [REGISTER][${requestId}] OTP saved`);

    /* ---------------- SEND WHATSAPP ---------------- */
    try {
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER!}`,
        to: `whatsapp:${phone_number}`,
        contentSid: "HX4057f00127a245fe3e76e3ca79990c73",
        contentVariables: JSON.stringify({ "1": otp }),
      });

      console.log(`✅ [REGISTER][${requestId}] WhatsApp OTP accepted by Twilio`);
    } catch (twilioError: any) {
      console.error(`❌ [REGISTER][${requestId}] Twilio error`, {
        code: twilioError.code,
        message: twilioError.message,
      });

      // ⚠️ Do NOT retry WhatsApp here
      return res.status(500).json({
        success: false,
        message: "OTP sending failed. Please try again.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "OTP has been sent to your Whatsapp number",
    });

  } catch (error) {
    console.error(`🔥 [REGISTER][${requestId}] Error`, error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again after sometimes",
    });
  }
};



// 📌 Verify OTP & login/register
export const verifyOtp = async (req: Request, res: Response) => {
  const requestId = Date.now(); // trace single request

  console.log(`🔐 [VERIFY OTP][${requestId}] Request received`);

  try {
    const { phone_number, otp } = req.body;

    console.log(`📥 [VERIFY OTP][${requestId}] Payload received`, {
      phone_number,
      otpProvided: Boolean(otp),
    });

    if (!phone_number || !otp) {
      console.warn(`⚠️ [VERIFY OTP][${requestId}] Missing phone or OTP`);
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP required",
      });
    }

    /* ---------------- REVIEW MODE ---------------- */
    if (process.env.REVIEW_MODE === "true") {
      console.log(`🧪 [VERIFY OTP][${requestId}] Review mode enabled`);

      if (otp !== process.env.REVIEW_STATIC_OTP) {
        console.warn(`❌ [VERIFY OTP][${requestId}] Invalid review OTP`);
        return res.status(400).json({
          success: false,
          message: "OTP expired or invalid",
        });
      }

      console.log(`✅ [VERIFY OTP][${requestId}] Review OTP verified`);
    } else {
      console.log(`🔎 [VERIFY OTP][${requestId}] Fetching OTP record`);

      const record = await Otp.findOne({ phone_number })
        .sort({ createdAt: -1 });

      if (!record) {
        console.warn(`❌ [VERIFY OTP][${requestId}] No OTP record found`);
        return res.status(400).json({
          success: false,
          message: "OTP expired or invalid",
        });
      }

      console.log(`📄 [VERIFY OTP][${requestId}] OTP record found`, {
        attempts: record.attempts,
        expiresAt: record.expiresAt,
      });

      if (record.expiresAt < new Date()) {
        console.warn(`⏰ [VERIFY OTP][${requestId}] OTP expired`);
        return res.status(400).json({
          success: false,
          message: "OTP expired",
        });
      }

      if (record.attempts >= 5) {
        console.warn(`🚫 [VERIFY OTP][${requestId}] Too many attempts`);
        return res.status(429).json({
          success: false,
          message: "Too many wrong attempts. Resend OTP and try again.",
        });
      }

      if (record.otp !== hashOtp(otp)) {
        record.attempts += 1;
        await record.save();

        console.warn(`❌ [VERIFY OTP][${requestId}] Invalid OTP attempt`, {
          attempts: record.attempts,
        });

        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }

      console.log(`✅ [VERIFY OTP][${requestId}] OTP verified successfully`);

      await Otp.deleteMany({ phone_number });
      console.log(`🧹 [VERIFY OTP][${requestId}] OTP records cleared`);
    }

    /* ---------------- USER LOGIN / REGISTER ---------------- */
    console.log(`👤 [VERIFY OTP][${requestId}] Checking user existence`);

    let user = await User.findOne({ phone_number });

    if (!user) {
      console.log(`➕ [VERIFY OTP][${requestId}] Creating new user`);
      user = await User.create({ phone_number });
    } else {
      console.log(`ℹ️ [VERIFY OTP][${requestId}] Existing user found`, {
        userId: user._id,
      });
    }

    if (!user.is_approved) {
      console.warn(`🚫 [VERIFY OTP][${requestId}] User suspended`, {
        userId: user._id,
      });
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
    }

    console.log(`🔑 [VERIFY OTP][${requestId}] Generating tokens`);

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie("userRefreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    console.log(`🎉 [VERIFY OTP][${requestId}] Login successful`, {
      userId: user._id,
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user,
    });

  } catch (error: any) {
    console.error(`🔥 [VERIFY OTP][${requestId}] Unexpected error`, {
      message: error.message,
      code: error.code,
      keyValue: error.keyValue,
    });

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};



export const sendingOtpToEmail = async (req: Request, res: Response) => {
  const requestId = Date.now();
  console.log(`📧 [EMAIL OTP SEND][${requestId}] Request received`);

  try {
    const { email, name, userId } = req.body;

    console.log(`📥 [EMAIL OTP SEND][${requestId}] Payload`, {
      email,
      name,
      userId,
    });

    const otp =
      process.env.REVIEW_MODE === "true"
        ? process.env.REVIEW_STATIC_OTP!
        : Math.floor(1000 + Math.random() * 9000).toString();

    console.log(`🔐 [EMAIL OTP SEND][${requestId}] OTP generated`, {
      reviewMode: process.env.REVIEW_MODE === "true",
    });

    const token = jwt.sign(
      { user: { userId, name, email }, otp },
      process.env.EMAIL_ACTIVATION_SECRET!,
      { expiresIn: "5m" }
    );

    console.log(`🪪 [EMAIL OTP SEND][${requestId}] Verification token created`);

    /* -------- REVIEW MODE -------- */
    if (process.env.REVIEW_MODE === "true") {
      console.log(`🧪 [EMAIL OTP SEND][${requestId}] Review mode – skipping email`);

      return res.status(201).json({
        success: true,
        reviewMode: true,
        token,
      });
    }

    console.log(`📨 [EMAIL OTP SEND][${requestId}] Sending email via Nylas`);

    await nylas.messages.send({
      identifier: process.env.USER_GRANT_ID!,
      requestBody: {
        to: [{ name, email }],
        subject: "Verify your email address - Stark",
        body: emailTemplate, // unchanged
      },
    });

    console.log(`✅ [EMAIL OTP SEND][${requestId}] Email sent successfully`);

    res.status(201).json({ success: true, token });
  } catch (error: any) {
    console.error(`🔥 [EMAIL OTP SEND][${requestId}] Error`, {
      message: error.message,
    });

    res.status(400).json({
      success: false,
      message: error.message || "Error sending OTP email",
    });
  }
};



// 📌 Verify Email OTP
export const verifyingEmail = async (req: Request, res: Response) => {
  const requestId = Date.now();
  console.log(`📧 [EMAIL OTP VERIFY][${requestId}] Verification started`);

  try {
    const { otp, token } = req.body;

    console.log(`📥 [EMAIL OTP VERIFY][${requestId}] Payload received`, {
      otpProvided: Boolean(otp),
      tokenProvided: Boolean(token),
    });

    const decoded: any = jwt.verify(
      token,
      process.env.EMAIL_ACTIVATION_SECRET!
    );

    console.log(`🔓 [EMAIL OTP VERIFY][${requestId}] Token decoded`, {
      userId: decoded?.user?.userId,
      email: decoded?.user?.email,
    });

    /* -------- REVIEW MODE -------- */
    if (process.env.REVIEW_MODE === "true") {
      console.log(`🧪 [EMAIL OTP VERIFY][${requestId}] Review mode enabled`);

      if (otp !== process.env.REVIEW_STATIC_OTP) {
        console.warn(`❌ [EMAIL OTP VERIFY][${requestId}] Invalid review OTP`);
        return res.status(400).json({
          success: false,
          message: "OTP is not correct or expired!",
        });
      }
    } else {
      if (decoded.otp !== otp) {
        console.warn(`❌ [EMAIL OTP VERIFY][${requestId}] OTP mismatch`);
        return res.status(400).json({
          success: false,
          message: "OTP is not correct or expired!",
        });
      }
    }

    console.log(`✅ [EMAIL OTP VERIFY][${requestId}] OTP verified`);

    const { name, email, userId } = decoded.user;

    console.log(`🔎 [EMAIL OTP VERIFY][${requestId}] Checking email uniqueness`);

    const emailTaken = await User.findOne({
      email,
      _id: { $ne: userId },
    });

    if (emailTaken) {
      console.warn(`🚫 [EMAIL OTP VERIFY][${requestId}] Email already in use`, {
        email,
      });

      return res.status(400).json({
        success: false,
        message: "Email is already associated with another account.",
      });
    }

    console.log(`👤 [EMAIL OTP VERIFY][${requestId}] Fetching user`);

    const user = await User.findById(userId);

    if (user && !user.email) {
      console.log(`✏️ [EMAIL OTP VERIFY][${requestId}] Updating user email`);

      user.name = name;
      user.email = email;
      await user.save();

      console.log(`🔑 [EMAIL OTP VERIFY][${requestId}] Generating tokens`);

      const accessToken = generateAccessToken(user.id);
      const refreshToken = generateRefreshToken(user.id);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      console.log(`🎉 [EMAIL OTP VERIFY][${requestId}] Email verified successfully`, {
        userId: user.id,
      });

      return res.status(201).json({
        success: true,
        accessToken,
        user,
      });
    }

    console.warn(`⚠️ [EMAIL OTP VERIFY][${requestId}] Email already verified`);
    return res.status(400).json({
      success: false,
      message: "Email has already been verified.",
    });

  } catch (error: any) {
    console.error(`🔥 [EMAIL OTP VERIFY][${requestId}] Error`, {
      message: error.message,
    });

    res.status(400).json({
      success: false,
      message: "Your OTP is expired or invalid!",
    });
  }
};



// 📌 Get logged-in user data
export const getLoggedInUserData = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { _id, password, ...rest } = req.user.toObject ? req.user.toObject() : req.user;

    res.status(200).json({
      success: true,
      user: {
        id: _id,
        ...rest, // include all other user fields except password
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error", error });
  }
};


// 📌 checl user active ride
export const checkActiveRide = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    console.log('User Active', userId)


    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found.",
      });
    }

    // Statuses that indicate an active ride
    const activeStatuses = ["Booked", "Processing", "Arrived", "Ongoing", "Reached"];

    // Find ONLY the active ride
    const activeRide = await Ride.findOne({
      userId,
      status: { $in: activeStatuses },
    })
      .populate("userId")
      .populate("driverId");

    if (!activeRide) {
      return res.status(200).json({
        success: false,
        hasActiveRide: false,
        ride: null,
      });
    }

    // Format response
    const formattedRide = {
      id: activeRide._id,
      ...activeRide.toObject(),
    };

    return res.status(200).json({
      success: true,
      hasActiveRide: true,
      ride: formattedRide,
    });

  } catch (error) {
    console.error("Error checking user active ride:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const createRideRequest = async (req: Request, res: Response) => {
  try {
    const {
      uniqueRideKey,
    } = req.body;

    const userId = req.user?.id;


    if (!uniqueRideKey || !userId) {
      return res.status(400).json({
        success: false,
        message: "uniqueRideKey and userId are required",
      });
    }

    // -------------------------------------------------
    // 🚨 2. CHECK EXISTING ACTIVE RIDE REQUEST
    // -------------------------------------------------
    const existingRequest = await RideRequest.findOne({
      userId,
      status: { $in: ["pending", "locked"] }, // 🔥 IMPORTANT
      expiresAt: { $gt: new Date() },         // 🔥 NOT EXPIRED
    });


    if (existingRequest) {
      return res.status(409).json({
        success: false,
        message: "Ride request already in progress",
        uniqueRideKey: existingRequest.uniqueRideKey,
      });
    }

    // -------------------------------------------------
    // 🚀 3. CREATE NEW RIDE REQUEST (TTL BASED)
    // -------------------------------------------------
    await RideRequest.create({
      uniqueRideKey,
      userId: new mongoose.Types.ObjectId(userId),
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000), // 60 seconds
    });

    return res.status(201).json({
      success: true,
      message: "Ride request created",
      uniqueRideKey,
      expiresIn: 60, // seconds
    });

  } catch (error: any) {
    console.error("Create RideRequest Error:", error);

    // -------------------------------------------------
    // 🚨 DUPLICATE KEY (SAME uniqueRideKey)
    // -------------------------------------------------
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ride request already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const expireRideRequest = async (req: Request, res: Response) => {
  try {
    const { uniqueRideKey, userId } = req.body;

    if (!uniqueRideKey || !userId) {
      return res.status(400).json({
        success: false,
        message: "uniqueRideKey and userId required",
      });
    }

    await RideRequest.updateOne(
      {
        uniqueRideKey,
        userId,
        status: "pending",
      },
      {
        $set: { status: "expired" },
      }
    );

    return res.json({
      success: true,
      message: "Ride request expired",
    });
  } catch (error) {
    console.error("Expire RideRequest Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllRides = async (req: any, res: Response) => {
  try {
    // console.log(req.user)
    const rides = await Ride.find({ userId: req.user.id }).populate("userId").populate("driverId");

    const formattedRides = rides.map((ride) => {
      const { _id, ...rest } = ride.toObject();
      return { id: _id, ...rest };
    });

    res.status(200).json({ success: true, rides: formattedRides });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching rides" });
  }
};


export const findRideById = async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log('user', id)


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

// 📌 Update User Push Token
export const updateUserPushToken = async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Push token is required" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { notificationToken: token },
      { new: true }
    );

    res.status(200).json({
      message: "Push token updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating push token:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const savePlaces = async (req: any, res: Response) => {
  const { label, address, location, placeId } = req.body;

  console.log(req.body)

  try {

    const user = await User.findById(req.user.id);

    user.savedPlaces.push({
      placeId: placeId,
      label,
      address,
      location
    });

    await user.save();

    res.json({ message: "Place saved successfully", savedPlaces: user.savedPlaces });
  } catch (error) {
    console.error("Error updating saved places:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const getSavedPlaces = async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user.id);
    // console.log(user)
    res.status(200).json({ data: user.savedPlaces });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching places" });
  }
};

export const deletedSavedPlaces = async (req: any, res: Response) => {
  try {
    const { placeId } = req.params;

    await User.updateOne(
      { _id: req.user.id },
      { $pull: { savedPlaces: { _id: placeId } } }
    );

    res.json({ message: "Place removed" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting places" });
  }
};