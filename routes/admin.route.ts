import express from "express";
import { activateAdmin, approveDriver, createAdmin, deactivateAdmin, deapproveDriver, getAdminHistory, getAllAdmins, getAllUsers, getDriverApprovalHistory, getDrivers, getDriverStats, getDriverWallet, getUserStats, loginAdmin, logoutAdmin, updateAdmin, updateDriver } from "../controllers/admin.controller";
import { isActiveAdmin, isAuthenticatedAdmin } from "../middleware/isAuthenticated";
import { checkAdminRole } from "../middleware/checkAdminRole";


const adminRouter = express.Router();

adminRouter.post("/login", loginAdmin);

adminRouter.post("/logout/:id", logoutAdmin);

// SuperAdmin-only route to add new admins
adminRouter.post("/add", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), createAdmin);

//get All Users
adminRouter.get("/users", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getAllUsers);

adminRouter.get("/users/stats", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getUserStats);


//get All Drivers
adminRouter.get("/drivers", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getDrivers);

adminRouter.get("/drivers/stats", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getDriverStats);

//Driver histories
adminRouter.get("/drivers/approval-history/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getDriverApprovalHistory);

adminRouter.get("/drivers/wallet/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getDriverWallet);


//Approve Drivers
adminRouter.patch("/drivers/approve/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), approveDriver);

//De-Approve Drivers
adminRouter.patch("/drivers/deapprove/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), deapproveDriver);

adminRouter.put("/drivers/:id", isAuthenticatedAdmin,isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), updateDriver);

//get all Admins
adminRouter.get("/admins", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getAllAdmins);

//Admin Histories
adminRouter.get("/admins/history/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getAdminHistory);

//update admin
adminRouter.put('/admins/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), updateAdmin);

//activate admin
adminRouter.patch('/admins/activate/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), activateAdmin);

//deactivate admin
adminRouter.patch('/admins/deactivate/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), deactivateAdmin);



export default adminRouter;