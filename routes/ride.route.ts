import express from "express";
import { isAuthenticated, isAuthenticatedAdmin, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { createOrder, verifyPayment } from "../controllers/payment.controller";
import { calculateFare, createFare, getFareByVehicleType, getFares, updateFare } from "../controllers/fare.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { isActiveAdmin } from "../middleware/checkAdminStatus";
import { checkAdminRole } from "../middleware/checkAdminRole";
import { cancelRide, newRide, updatingRideStatus, verifyRideOtp } from "../controllers/ride.controller";

const rideRouter = express.Router();
rideRouter.post("/new-ride", isAuthenticatedDriver, checkDriverDevice, newRide);

rideRouter.post("/verify-ride-otp", isAuthenticatedDriver, checkDriverDevice, verifyRideOtp);

rideRouter.put("/update-ride-status", isAuthenticatedDriver, checkDriverDevice, updatingRideStatus);

rideRouter.put("/cancel", isAuthenticated, cancelRide);


export default rideRouter;