import express from "express";
import {
  findRideById,
  getAllRides,
  getDriverEarnings,
  getDriversById,
  getDriverWallet,
  getLoggedInDriverData,
  logoutDriver,
  refreshTokenDriver,
  sendingOtpToPhone,
  updateDriverPushToken,
  updateDriverStatus,
  verifyingEmailOtp,
  verifyPhoneOtpForLogin,
  verifyPhoneOtpForRegistration,
} from "../controllers/driver.controller";
import { isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { checkDriverDevice } from "../middleware/checkDevice";
import { checkDriverApproval } from "../middleware/checkDriverApproval";
import { checkActiveRide } from "../middleware/checkActiveRide";

const driverRouter = express.Router();

driverRouter.post("/send-otp", sendingOtpToPhone);

driverRouter.post("/login", checkActiveRide, verifyPhoneOtpForLogin);

driverRouter.post("/logout", logoutDriver);

driverRouter.post("/refresh-token", refreshTokenDriver);

driverRouter.post("/verify-otp", verifyPhoneOtpForRegistration);

driverRouter.post("/registration-driver", verifyingEmailOtp);

driverRouter.get("/me", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, getLoggedInDriverData);

driverRouter.get("/wallet", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, getDriverWallet);

driverRouter.get("/get-drivers-data", getDriversById);

driverRouter.put("/update-status", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, checkActiveRide, updateDriverStatus);

driverRouter.put("/update-push-token", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, updateDriverPushToken);


driverRouter.get("/ride/:id", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, findRideById);

driverRouter.get("/get-rides", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, getAllRides);

driverRouter.get("/earnings", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, getDriverEarnings);


export default driverRouter;