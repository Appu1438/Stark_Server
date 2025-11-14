import express from "express";
import {
  calculateFare,
  findRideById,
  getAllRides,
  getLoggedInUserData,
  logout,
  refreshToken,
  registerUser,
  sendingOtpToEmail,
  updateUserPushToken,
  verifyingEmail,
  verifyOtp,
} from "../controllers/user.controller";
import { isAuthenticated } from "../middleware/isAuthenticated";
import { checkUserApproval } from "../middleware/checkUserApproval";

const userRouter = express.Router();

userRouter.post("/registration", registerUser);

userRouter.post("/logout", logout);

userRouter.post("/refresh-token", refreshToken);

userRouter.post("/verify-otp", verifyOtp);

userRouter.post("/email-otp-request", sendingOtpToEmail);

userRouter.put("/email-otp-verify", verifyingEmail);

userRouter.get("/me", isAuthenticated, checkUserApproval, getLoggedInUserData);

userRouter.put("/update-push-token", isAuthenticated, checkUserApproval, updateUserPushToken);


userRouter.get("/get-rides", isAuthenticated, checkUserApproval, getAllRides);

userRouter.get("/ride/:id", isAuthenticated, checkUserApproval, findRideById);


export default userRouter;