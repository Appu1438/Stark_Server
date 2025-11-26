import express from "express";
import { isAuthenticated, isAuthenticatedAdmin, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { createOrder, verifyPayment } from "../controllers/payment.controller";
import { calculateFare, createFare, getFareByVehicleType, getFares, updateFare } from "../controllers/fare.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { isActiveAdmin } from "../middleware/checkAdminStatus";
import { checkAdminRole } from "../middleware/checkAdminRole";
import { cancelRide, newRide, ratingDriver, ratingUser, updatingRideStatus, verifyRideOtp } from "../controllers/ride.controller";
import { checkDriverApproval } from "../middleware/checkDriverApproval";
import { checkUserApproval } from "../middleware/checkUserApproval";
import { checkDriverActiveStatus } from "../middleware/checkDriverStatus";
import { checkActiveRide } from "../middleware/checkActiveRide";

const rideRouter = express.Router();
rideRouter.post("/new-ride", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, checkDriverActiveStatus, checkActiveRide, newRide);

rideRouter.post("/verify-ride-otp", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, checkDriverActiveStatus, verifyRideOtp);

rideRouter.put("/update-ride-status", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, checkDriverActiveStatus, updatingRideStatus);

rideRouter.put("/cancel", isAuthenticated, checkUserApproval, cancelRide);

rideRouter.put("/rating-driver", isAuthenticated, checkUserApproval, ratingDriver);

rideRouter.put("/rating-user", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, ratingUser);


export default rideRouter;