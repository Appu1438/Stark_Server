import express from "express";
import { isAuthenticatedAdmin, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { isActiveAdmin } from "../middleware/checkAdminStatus";
import { checkAdminRole } from "../middleware/checkAdminRole";
import { createPackageTrip, deletePackageTrip, getAllPackageTrips, updatePackageTrip } from "../controllers/package.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { checkDriverApproval } from "../middleware/checkDriverApproval";

const packageRouter = express.Router();

//Package Trips
packageRouter.post('/', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin"]), createPackageTrip)
packageRouter.put('/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin"]), updatePackageTrip)
packageRouter.delete('/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin"]), deletePackageTrip)

packageRouter.get('/admin/get-all-packages', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin", "Moderator"]), getAllPackageTrips)
packageRouter.get('/driver/get-all-packages', isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, getAllPackageTrips)


export default packageRouter;