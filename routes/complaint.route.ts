import express from "express";
import { isAuthenticated, isAuthenticatedAdmin, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { checkUserApproval } from "../middleware/checkUserApproval";
import { createDriverComplaint, createUserComplaint, getDriverComplaints, getUserComplaints } from "../controllers/complaint.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { checkDriverApproval } from "../middleware/checkDriverApproval";


const complaintRouter = express.Router();

complaintRouter.get('/user', isAuthenticated, checkUserApproval, getUserComplaints)
complaintRouter.post('/user', isAuthenticated, checkUserApproval, createUserComplaint)
complaintRouter.get('/driver', isAuthenticatedDriver, checkDriverDevice,checkDriverApproval, getDriverComplaints)
complaintRouter.post('/driver', isAuthenticatedDriver, checkDriverDevice,checkDriverApproval, createDriverComplaint)

export default complaintRouter;