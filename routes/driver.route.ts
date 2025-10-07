import express from "express";
import {
  findRideById,
  getAllRides,
  getDriversById,
  getDriverWallet,
  getFareByVehicleType,
  getLoggedInDriverData,
  logoutDriver,
  newRide,
  refreshTokenDriver,
  sendingOtpToPhone,
  updateDriverPushToken,
  updateDriverStatus,
  updatingRideStatus,
  verifyingEmailOtp,
  verifyPhoneOtpForLogin,
  verifyPhoneOtpForRegistration,
} from "../controllers/driver.controller";
import { isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { checkDriverDevice } from "../middleware/checkDevice";

const driverRouter = express.Router();

driverRouter.post("/send-otp", sendingOtpToPhone);

driverRouter.post("/login", verifyPhoneOtpForLogin);

driverRouter.post("/logout", logoutDriver);

driverRouter.post("/refresh-token", refreshTokenDriver);

driverRouter.post("/verify-otp", verifyPhoneOtpForRegistration);

driverRouter.post("/registration-driver", verifyingEmailOtp);

driverRouter.get("/me", isAuthenticatedDriver, checkDriverDevice, getLoggedInDriverData);

driverRouter.get("/wallet", isAuthenticatedDriver, checkDriverDevice, getDriverWallet);

driverRouter.get("/get-drivers-data", getDriversById);

driverRouter.put("/update-status", isAuthenticatedDriver, checkDriverDevice, updateDriverStatus);

driverRouter.put("/update-push-token", isAuthenticatedDriver, checkDriverDevice, updateDriverPushToken);

driverRouter.post("/new-ride", isAuthenticatedDriver, checkDriverDevice, newRide);

driverRouter.put(
  "/update-ride-status",
  isAuthenticatedDriver,
  checkDriverDevice,
  updatingRideStatus
);

driverRouter.get("/ride/:id", isAuthenticatedDriver, checkDriverDevice, findRideById);

driverRouter.get("/get-rides", isAuthenticatedDriver, checkDriverDevice, getAllRides);


export default driverRouter;