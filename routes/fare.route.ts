import express from "express";
import { isAuthenticated, isAuthenticatedAdmin, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { createOrder, verifyPayment } from "../controllers/payment.controller";
import { calculateFare, createFare, getFareByVehicleType, getFares, updateFare } from "../controllers/fare.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { isActiveAdmin } from "../middleware/checkAdminStatus";
import { checkAdminRole } from "../middleware/checkAdminRole";

const fareRouter = express.Router();

//calculate fare
fareRouter.post('/calculate-fare', isAuthenticated, calculateFare)

//get fare by vehicle type and district
fareRouter.get('/:vehicle_type/:district', isAuthenticatedDriver, checkDriverDevice, getFareByVehicleType)

//create or update fare details
fareRouter.post('/create-fare', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(["SuperAdmin", "Admin"]), createFare)
fareRouter.patch('/update-fare', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(["SuperAdmin", "Admin"]), updateFare)

fareRouter.get('/get-fares', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(["SuperAdmin", "Admin"]), getFares)


export default fareRouter;