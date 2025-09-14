require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import jwt from "jsonwebtoken";
import { nylas } from "../app";
import { sendToken } from "../utils/send-token";
import { Ride, User } from "../db/schema";


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken, { lazyLoading: true });


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
      await sendToken(existingUser, res);
    } else {
      const newUser = new User({ phone_number });
      await newUser.save();
      res.status(200).json({
        success: true,
        message: "OTP verified successfully!",
        user: newUser,
      });
    }
  } catch (error) {
    console.log(error);
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
      await sendToken(user, res);
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
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    console.log(error);
  }
};


// 📌 Get user rides
export const getAllRides = async (req: any, res: Response) => {
  try {
    const rides = await Ride.find({ userId: req.user?._id })
      .populate("driver")
      .populate("user");

    res.status(200).json({ rides });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching rides" });
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
      req.user._id,
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
