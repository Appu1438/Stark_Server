import express from "express";
import {
  checkActiveRide,
  createRideRequest,
  deletedSavedPlaces,
  expireRideRequest,
  findRideById,
  getAllRides,
  getLoggedInUserData,
  getSavedPlaces,
  logout,
  refreshToken,
  registerUser,
  savePlaces,
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


userRouter.get("/check-active-ride", isAuthenticated, checkUserApproval, checkActiveRide);

userRouter.post("/ride-request/create", isAuthenticated, checkUserApproval, createRideRequest);

userRouter.post("/ride-request/expire", isAuthenticated, checkUserApproval, expireRideRequest);

userRouter.get("/get-rides", isAuthenticated, checkUserApproval, getAllRides);

userRouter.get("/ride/:id", isAuthenticated, checkUserApproval, findRideById);

userRouter.post("/save-place", isAuthenticated, checkUserApproval, savePlaces);

userRouter.get("/save-place", isAuthenticated, checkUserApproval, getSavedPlaces);

userRouter.delete("/save-place/:placeId", isAuthenticated, checkUserApproval, deletedSavedPlaces);


export default userRouter;