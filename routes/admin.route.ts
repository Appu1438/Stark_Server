import express from "express";
import { activateAdmin, approveDriver, createAdmin, deactivateAdmin, deapproveDriver, getAdminHistory, getAllAdmins, getAllTransactions, getAllUsers, getDriverApprovalHistory, getDrivers, getDriverStats, getDriverWallet, getRides, getTransactionsInfo, getUserStats, loginAdmin, logoutAdmin, refreshTokenAdmin, updateAdmin, updateDriver } from "../controllers/admin.controller";
import { isAuthenticatedAdmin } from "../middleware/isAuthenticated";
import { checkAdminRole } from "../middleware/checkAdminRole";
import { isActiveAdmin } from "../middleware/checkAdminStatus";


const adminRouter = express.Router();

adminRouter.post("/login", loginAdmin);

adminRouter.post("/logout/:id", logoutAdmin);

adminRouter.post("/refresh", refreshTokenAdmin);

// SuperAdmin-only route to add new admins
adminRouter.post("/add", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), createAdmin);

// Users
adminRouter.get("/users", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getAllUsers);

adminRouter.get("/users/stats", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getUserStats);

// Drivers
adminRouter.get("/drivers", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getDrivers);

adminRouter.get("/drivers/stats", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin', 'Moderator']), getDriverStats);

adminRouter.get("/drivers/approval-history/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getDriverApprovalHistory);

adminRouter.get("/drivers/wallet/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getDriverWallet);


adminRouter.patch("/drivers/approve/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), approveDriver);

adminRouter.patch("/drivers/deapprove/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), deapproveDriver);

adminRouter.put("/drivers/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), updateDriver);

// Admins
adminRouter.get("/admins", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getAllAdmins);

adminRouter.get("/admins/history/:id", isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', 'Admin']), getAdminHistory);

adminRouter.put('/admins/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), updateAdmin);

adminRouter.patch('/admins/activate/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), activateAdmin);

adminRouter.patch('/admins/deactivate/:id', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin']), deactivateAdmin);

// Transactions
adminRouter.get('/transactions', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin", "Moderator"]), getAllTransactions)

adminRouter.get('/transactions-info', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin", "Moderator"]), getTransactionsInfo)

// Rides
adminRouter.get('/rides', isAuthenticatedAdmin, isActiveAdmin, checkAdminRole(['SuperAdmin', "Admin", "Moderator"]), getRides)


export default adminRouter;