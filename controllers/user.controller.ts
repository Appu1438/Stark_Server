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
  try {
    const { phone_number, otp } = req.body;

    if (!phone_number || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP required",
      });
    }

    /* ---------------- REVIEW MODE ---------------- */
    if (process.env.REVIEW_MODE === "true") {
      if (otp !== process.env.REVIEW_STATIC_OTP) {
        return res.status(400).json({
          success: false, message: "OTP expired or invalid",
        });
      }
    } else {
      const record = await Otp.findOne({ phone_number })
        .sort({ createdAt: -1 });

      if (!record) {
        return res.status(400).json({
          success: false,
          message: "OTP expired or invalid",
        });
      }

      // ⏱️ OTP expired?
      if (record.expiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          message: "OTP expired",
        });
      }

      /* --------- BRUTE FORCE PROTECTION --------- */
      if (record.attempts >= 5) {
        return res.status(429).json({
          success: false,
          message: "Too many wrong attempts. Resend OTP and try again.",
        });
      }

      if (record.otp !== hashOtp(otp)) {
        record.attempts += 1;
        await record.save();

        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }

      /* --------- OTP SUCCESS --------- */
      await Otp.deleteMany({ phone_number });
    }

    /* ---------------- USER LOGIN / REGISTER ---------------- */
    let user = await User.findOne({ phone_number });
    if (!user) user = await User.create({ phone_number });

    if (!user.is_approved) {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
      });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie("userRefreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user,
    });

  } catch (error) {
    console.error("🔥 [VERIFY OTP] Error", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};





export const sendingOtpToEmail = async (req: Request, res: Response) => {
  try {
    const { email, name, userId } = req.body;

    // 🔥 REVIEW MODE — STATIC OTP
    const otp =
      process.env.REVIEW_MODE === "true"
        ? process.env.REVIEW_STATIC_OTP!
        : Math.floor(1000 + Math.random() * 9000).toString();

    // Create a temporary token for verification
    const token = jwt.sign(
      { user: { userId, name, email }, otp },
      process.env.EMAIL_ACTIVATION_SECRET!,
      { expiresIn: "5m" }
    );

    // 🔥 REVIEW MODE — SKIP EMAIL SENDING
    if (process.env.REVIEW_MODE === "true") {
      return res.status(201).json({
        success: true,
        reviewMode: true,
        token,
      });
    }

    // --- LOGO URL ---
    const logoUrl =
      "https://res.cloudinary.com/starkcab/image/upload/v1765043362/App%20Logos/FullLogo_p0evhu.png";

    // --- EMAIL TEMPLATE (UNCHANGED) ---
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f7; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
          .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 40px; margin-bottom: 40px; }
          .header { padding: 30px 40px; text-align: center; background-color: #000000; }
          .logo { max-height: 40px; }
          .content { padding: 40px; color: #333333; line-height: 1.6; }
          .otp-block { background-color: #f0f2f5; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; border: 1px dashed #ccc; }
          .otp-code { font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #000000; margin: 0; }
          .footer { background-color: #f9f9f9; padding: 20px 40px; text-align: center; font-size: 12px; color: #888888; border-top: 1px solid #eeeeee; }
          .footer a { color: #888888; text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
             <img src="${logoUrl}" alt="Stark Logo" class="logo" style="display:block; margin:auto;" /> 
          </div>

          <div class="content">
            <h2 style="margin-top: 0; font-weight: 600; color: #111;">Verify your email address</h2>
            <p>Hi ${name},</p>
            <p>Thank you for joining <strong>Stark</strong>. To complete your registration, please verify your email address by entering the code below:</p>
            
            <div class="otp-block">
              <p class="otp-code">${otp}</p>
            </div>

            <p style="font-size: 14px; color: #666;">This OTP is valid for <strong>5 minutes</strong>. If you did not request this verification, please disregard this email.</p>
            
            <p style="margin-top: 30px;">Best regards,<br><strong>The Stark Team</strong></p>
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Stark OPC Pvt Ltd. All rights reserved.</p>
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await nylas.messages.send({
      identifier: process.env.USER_GRANT_ID!,
      requestBody: {
        to: [{ name, email }],
        subject: "Verify your email address - Stark",
        body: emailTemplate,
      },
    });

    res.status(201).json({ success: true, token });
  } catch (error: any) {
    console.log(error);
    res.status(400).json({
      success: false,
      message: error.message || "Error sending OTP email",
    });
  }
};



// 📌 Verify Email OTP
export const verifyingEmail = async (req: Request, res: Response) => {
  try {
    const { otp, token } = req.body;
    const decoded: any = jwt.verify(
      token,
      process.env.EMAIL_ACTIVATION_SECRET!
    );

    // 🔥 REVIEW MODE — STATIC OTP CHECK
    if (process.env.REVIEW_MODE === "true") {
      if (otp !== process.env.REVIEW_STATIC_OTP) {
        return res.status(400).json({
          success: false,
          message: "OTP is not correct or expired!",
        });
      }
    } else {
      if (decoded.otp !== otp) {
        return res.status(400).json({
          success: false,
          message: "OTP is not correct or expired!",
        });
      }
    }

    const { name, email, userId } = decoded.user;

    const emailTaken = await User.findOne({
      email,
      _id: { $ne: userId },
    });

    if (emailTaken) {
      return res.status(400).json({
        success: false,
        message: "Email is already associated with another account.",
      });
    }

    const user = await User.findById(userId);

    if (user && !user.email) {
      user.name = name;
      user.email = email;
      await user.save();

      const accessToken = generateAccessToken(user.id);
      const refreshToken = generateRefreshToken(user.id);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        accessToken,
        user,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Email has already been verified.",
      });
    }
  } catch (error) {
    console.log(error);
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