import express from "express";
import { isAuthenticated, isAuthenticatedAdmin, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { checkUserApproval } from "../middleware/checkUserApproval";
import { createDriverComplaint, createUserComplaint, getAllComplaintsForAdmin, getDriverComplaints, getUserComplaints, markComplaintInReview, resolveComplaint } from "../controllers/complaint.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { checkDriverApproval } from "../middleware/checkDriverApproval";
import { isActiveAdmin } from "../middleware/checkAdminStatus";
import { checkAdminRole } from "../middleware/checkAdminRole";


const complaintRouter = express.Router();

complaintRouter.get('/user', isAuthenticated, checkUserApproval, getUserComplaints)
complaintRouter.post('/user', isAuthenticated, checkUserApproval, createUserComplaint)

complaintRouter.get('/driver', isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, getDriverComplaints)
complaintRouter.post('/driver', isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, createDriverComplaint)

complaintRouter.get('/get-all-complaints', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(["SuperAdmin", "Admin"]), getAllComplaintsForAdmin)

complaintRouter.patch('/:id/in-review', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(["SuperAdmin", "Admin"]), markComplaintInReview)

complaintRouter.patch('/:id/resolve', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(["SuperAdmin", "Admin"]), resolveComplaint)

export default complaintRouter;