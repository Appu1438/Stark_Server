require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import jwt from "jsonwebtoken";
import { nylas } from "../app";
import { generateAccessToken, generateRefreshToken, sendToken } from "../utils/generateToken";
import { Fare, Ride, User } from "../db/schema";


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken, { lazyLoading: true });


const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

/**
 * Refresh Token Controller
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    console.log('Refresh Token  ', refreshToken)

    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

    // Verify token
    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ message: "Invalid or expired refresh token" });

      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(403).json({ message: "Refresh token not found or already invalidated" });
      }

      // Generate new access token
      const newAccessToken = generateAccessToken(user._id);

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
export const logout = async (req: Request, res: Response) => {
  try {
    // Clear the refresh token cookie
    res.cookie("refreshToken", "", {
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



// 📌 Register new user (Send OTP via SMS)
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { phone_number } = req.body;
    await client.verify.v2
      .services(process.env.TWILIO_SERVICE_SID!)
      .verifications.create({
        channel: "sms",
        to: phone_number,
      });

    res.status(201).json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(400).json({ success: false });
  }
};


// 📌 Verify OTP & login/register
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { phone_number, otp } = req.body;

    await client.verify.v2
      .services(process.env.TWILIO_SERVICE_SID!)
      .verificationChecks.create({
        to: phone_number,
        code: otp,
      });

    let existingUser = await User.findOne({ phone_number });

    if (existingUser) {
      // Convert MongoDB _id -> id
      const userData = existingUser.toObject();
      userData.id = userData._id;
      delete userData._id;


      // await sendToken(userData, res);
      const accessToken = generateAccessToken(userData.id)
      const refreshToken = generateRefreshToken(userData.id)

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // only over HTTPS in production
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(201).json({
        success: true,
        accessToken,
        user: userData,
      });
    } else {
      const newUser = new User({ phone_number });
      await newUser.save();

      // Convert MongoDB _id -> id
      const userData = newUser.toObject();
      userData.id = userData._id;
      delete userData._id;

      res.status(200).json({
        success: true,
        message: "OTP verified successfully!",
        user: userData,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({
      success: false,
      message: "Something went wrong!",
    });
  }
};


// 📌 Send OTP to Email
export const sendingOtpToEmail = async (req: Request, res: Response) => {
  try {
    const { email, name, userId } = req.body;
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const token = jwt.sign(
      { user: { userId, name, email }, otp },
      process.env.EMAIL_ACTIVATION_SECRET!,
      { expiresIn: "5m" }
    );

    await nylas.messages.send({
      identifier: process.env.USER_GRANT_ID!,
      requestBody: {
        to: [{ name, email }],
        subject: "Verify your email address!",
        body: `
          <p>Hi ${name},</p>
          <p>Your Stark verification code is ${otp}. If you didn't request for this OTP, please ignore this email!</p>
          <p>Thanks,<br>Stark Team</p>
        `,
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
    const decoded: any = jwt.verify(token, process.env.EMAIL_ACTIVATION_SECRET!);

    if (decoded.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is not correct or expired!",
      });
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
      // await sendToken(user, res);
      const accessToken = generateAccessToken(user.id)
      const refreshToken = generateRefreshToken(user.id)

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // only over HTTPS in production
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 7 days
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


// 📌 Get user rides
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



