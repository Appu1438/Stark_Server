require("dotenv").config();
import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { admin, adminAuditLog, driver, driverAuditLog, DriverWallet, Fare, Ride, Transaction, User } from "../db/schema";
import { generateAccessTokenAdmin, generateRefreshTokenAdmin } from "../utils/generateToken";
import { sendPushNotification } from "../utils/sendNotification";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// ------------------- LOGIN ADMIN -------------------
export const loginAdmin = async (req: Request, res: Response) => {
  const { email, password, ip } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const foundAdmin = await admin.findOne({ email });
    if (!foundAdmin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    if (foundAdmin.lockedUntil && new Date() < foundAdmin.lockedUntil) {
      return res.status(403).json({ message: "Account is temporarily locked." });
    }

    const isPasswordValid = await bcrypt.compare(password, foundAdmin.password);
    if (!isPasswordValid) {
      let updateData: any = { $inc: { loginAttempts: 1 } };

      if (foundAdmin.loginAttempts >= 5) {
        updateData = {
          loginAttempts: 3,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        };
      }

      await admin.findByIdAndUpdate(foundAdmin._id, updateData);
      return res.status(403).json({ message: "Invalid credentials." });
    }

    // ✅ Handle inactive account
    if (foundAdmin.status !== "active") {
      let updateData: any = { $inc: { loginAttempts: 1 } };

      if (foundAdmin.loginAttempts >= 10) {
        updateData = {
          loginAttempts: 5,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        };
      }

      await admin.findByIdAndUpdate(foundAdmin._id, updateData);
      return res.status(403).json({ message: "Admin account is not active." });
    }

    // ✅ Successful login
    await admin.findByIdAndUpdate(foundAdmin._id, {
      lastLoggedIn: new Date(),
      lastIp: ip,
      loginAttempts: 0,
      lockedUntil: null,
    });

    const accessToken = generateAccessTokenAdmin(foundAdmin)
    const refreshToken = generateRefreshTokenAdmin(foundAdmin)


    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only over HTTPS in production
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });



    // ✅ Convert Mongoose doc → plain object & remove password
    const adminObj = foundAdmin.toObject();
    delete adminObj.password;

    res.status(200).json({
      message: "Login successful",
      admin: {
        ...adminObj,
        accessToken,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};



// ------------------- LOGOUT ADMIN -------------------
export const logoutAdmin = async (req: any, res: Response) => {
  const { id } = req.params
  console.log(id)
  try {
    if (!id) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    console.log(id)
    await admin.findByIdAndUpdate(id, { lastLoggedOut: new Date() });


    const isDev = process.env.NODE_ENV !== "production";

    res.cookie("refreshToken", null, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only over HTTPS in production
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });



    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// ------------------- REFRESH ADMIN -------------------
export const refreshTokenAdmin = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken; // Access the cookie
    console.log(refreshToken)
    console.log("Cookies received:", req.cookies); // Log all cookies


    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

    // Verify token
    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ message: "Invalid or expired refresh token" });

      const foundAdmin = await admin.findById(decoded.id);
      if (!foundAdmin) {
        return res.status(403).json({ message: "Refresh token not found or already invalidated" });
      }

      // Generate new access token
      const newAccessToken = await generateAccessTokenAdmin(foundAdmin);

      return res.json({ accessToken: newAccessToken });
    });
  } catch (error) {
    console.error("Refresh Token Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// ------------------- CREATE ADMIN -------------------
export const createAdmin = async (req: any, res: Response) => {
  try {
    const {
      name,
      email,
      password,
      role = "Admin",
      status = "active",
      phone,
      profileImage,
      identityType,
      identityNumber,
      identityDocument,
      isVerified,
      address,
      dob,
      gender,
      city,
      branch,
      state,
      country,
    } = req.body;

    // 1. Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    // 2. Check if admin already exists
    const existingAdmin = await admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(409)
        .json({ success: false, message: "Admin already exists." });
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create new admin
    const newAdmin = await admin.create({
      name,
      email,
      password: hashedPassword,
      role,
      status,
      phone,
      profileImage,

      // 🔑 Identity
      identityType,
      identityNumber,
      identityDocument,
      isVerified,

      // 📍 Personal info
      address,
      dob: dob ? new Date(dob) : null, // ensure Date object
      gender,
      city,
      branch,
      state,
      country,

      // Audit
      createdBy: req.admin?.id || null,
    });

    // 5. Populate createdBy if available
    const populatedAdmin = await admin
      .findById(newAdmin._id)
      .populate("createdBy", "name email role");

    res.status(201).json({
      success: true,
      message: "Admin created successfully.",
      data: populatedAdmin,
    });
  } catch (error) {
    console.error("Create admin error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};


export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const queryNew = req.query.new === "true";
    const usersList = queryNew
      ? await User.find().sort({ createdAt: -1 }).limit(5)
      : await User.find();

    res.status(200).json({
      success: true,
      message: queryNew ? "Latest users fetched successfully" : "Users fetched successfully",
      users: usersList,
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


export const getUserStats = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken; // Access the cookie
  console.log(refreshToken)
  console.log("Cookies received:", req.cookies); // Log all cookies

  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" }, // group by month number (1-12)
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } }, // sort by month ascending
    ]);

    res.status(200).json(stats);
  } catch (err) {
    console.error("User stats error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 📊 Get Driver Registration Statistics (per month)
export const getDriverStats = async (req: Request, res: Response) => {
  try {
    const stats = await driver.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json(stats);
  } catch (err) {
    console.error("Driver stats error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET drivers
export const getDrivers = async (req: Request, res: Response) => {
  try {
    const { new: isNew } = req.query;

    const driversList = isNew === "true"
      ? await driver.find().sort({ createdAt: -1 }).limit(5)
      : await driver.find().sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      message: "Drivers fetched successfully",
      drivers: driversList,
    });
  } catch (err) {
    console.error("Get drivers error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Approve Driver
export const approveDriver = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { remark } = req.body; // ✅ get remark from frontend
    const adminId = req.admin.id;

    const foundDriver = await driver.findById(id);
    if (!foundDriver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }
    if (foundDriver.is_approved) {
      return res.status(400).json({ success: false, message: "Driver already approved" });
    }

    foundDriver.is_approved = true;
    await foundDriver.save();

    await driverAuditLog.findOneAndUpdate(
      { driverId: id },
      {
        $push: {
          history: {
            action: "Approved",
            actionBy: adminId,
            actionOn: new Date(),
            remark: remark || "Approved without remark" // ✅ store remark
          },
        },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Driver approved successfully",
      data: foundDriver,
    });
  } catch (error) {
    console.error("Error approving driver:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


export const deapproveDriver = async (req: any, res: Response) => {
  try {
    const { id } = req.params;        // driverId
    const { remark } = req.body;
    const adminId = req.admin.id;

    const Driver = await driver.findById(id);

    if (!Driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // Already de-approved
    if (!Driver.is_approved ) {
      return res.status(400).json({
        success: false,
        message: "Driver already not approved",
      });
    }
    if (Driver.pending_suspension ) {
      return res.status(400).json({
        success: false,
        message: "Driver marked for suspension",
      });
    }

    // 🔍 Check if driver has an active ride
    const activeRide = await Ride.findOne({
      driverId: id,
      status: { $in: ["Booked", "Processing", "Arrived", "Ongoing", "Reached"] },
    });

    if (activeRide) {
      // 🚫 Cannot suspend now → mark for later
      Driver.pending_suspension = true;
      await Driver.save();

      // 🔔 Notify driver that suspension will apply after ride
      if (Driver.notificationToken) {
        await sendPushNotification(
          Driver.notificationToken,
          "⚠️ Suspension Pending",
          "Your account has been marked for suspension. It will take effect after your current ride is completed."
        );
      }

      // 📝 Log audit
      await driverAuditLog.findOneAndUpdate(
        { driverId: id },
        {
          $push: {
            history: {
              action: "Pending Suspension",
              actionBy: adminId,
              actionOn: new Date(),
              remark: remark || "Suspension queued until active ride completes",
            },
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        pending: true,
        message: "Driver has an active ride. Suspension is marked and will be applied after ride completion.",
        data: Driver,

      });
    }

    // ✅ No active ride → suspend immediately
    Driver.is_approved = false;
    Driver.pending_suspension = false;
    await Driver.save();

    // 🔔 Notify driver immediately
    if (Driver.notificationToken) {
      await sendPushNotification(
        Driver.notificationToken,
        "🚫 Account Suspended",
        remark || "Your StarkCabs driver account has been suspended. Contact support for assistance."
      );
    }

    // 📝 Audit log
    await driverAuditLog.findOneAndUpdate(
      { driverId: id },
      {
        $push: {
          history: {
            action: "De-Approved",
            actionBy: adminId,
            actionOn: new Date(),
            remark: remark || "De-approved without remark"
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      pending: false,
      message: "Driver de-approved successfully.",
      data: Driver,
    });

  } catch (error) {
    console.error("Error de-approving driver:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateDriver = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Admin ID is required" });
    }

    if (!req.body.driver) {
      return res.status(400).json({ message: "No update data provided" });
    }

    const updates = { ...req.body.driver };

    // ✅ Remove empty fields so they won't overwrite
    Object.keys(updates).forEach((key) => {
      if (updates[key] === "" || updates[key] === null || updates[key] === undefined) {
        delete updates[key];
      }
    });


    // ✅ Update admin in DB
    const updatedDriver = await driver.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
    if (!updatedDriver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    // ✅ Save audit log
    await driverAuditLog.findOneAndUpdate(
      { driverId: id },
      {
        $push: {
          history: {
            action: "Details Updated",
            actionBy: req.admin?.id,
            actionOn: new Date(),
            remark: req.body.remark || "Updated without remark",
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      message: "Driver updated successfully",
      data: updatedDriver,
    });
  } catch (error: any) {
    console.error("Error updating driver:", error);
    return res.status(500).json({
      message: "Error updating driver",
      error: error.message,
    });
  }
}

export const getDriverApprovalHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // driverId
    console.log("Driver ID:", id);

    const approvalHistory = await driverAuditLog
      .findOne({ driverId: id }) // ✅ use driverId instead of id
      .populate({
        path: "history.actionBy", // ✅ nested populate
        select: "name email role status", // only required fields
        model: "admin",
      });

    console.log(approvalHistory)

    if (!approvalHistory) {
      return res.status(404).json({
        success: false,
        message: "No approval history found for this driver",
      });
    }

    res.status(200).json({
      success: true,
      message: "Driver approval history fetched successfully",
      data: approvalHistory,
    });
  } catch (error) {
    console.error("Error fetching driver approval history:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getDriverWallet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const driverId = id // depends on your auth middleware

    if (!driverId) {
      return res.status(401).json({ message: "Unauthorized: Driver not found" });
    }

    // ✅ Find wallet (or create empty wallet if not found)
    let wallet = await DriverWallet.findOne({ driverId });
    console.log(wallet)


    if (!wallet) {
      // Create a wallet if not found (optional, depends on your business logic)
      wallet = await DriverWallet.create({ driverId, balance: 0, history: [] });
    }

    return res.status(200).json({
      success: true,
      wallet: {
        balance: wallet.balance,
        history: wallet.history,
      },
    });
  } catch (error) {
    console.error("Error fetching driver wallet:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet details",
      error,
    });
  }
};



//Get all Admins
export const getAllAdmins = async (req: Request, res: Response) => {
  try {
    // fetch all admins, exclude password
    const admins = await admin
      .find()
      .select("-password")
      .populate("createdBy", "name email role status") // populate createdBy with some fields
      .populate("updatedBy", "name email role status"); // populate updatedBy with some fields

    console.log(admins)

    res.status(200).json({
      success: true,
      message: "Admins fetched successfully",
      data: admins,
    });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//admin history
export const getAdminHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log("Admin ID:", id);

    const approvalHistory = await adminAuditLog
      .findOne({ adminId: id })
      .populate({
        path: "history.actionBy", // ✅ nested populate
        select: "name email role status", // only required fields
        model: "admin",
      });

    console.log(approvalHistory)

    if (!approvalHistory) {
      return res.status(404).json({
        success: false,
        message: "No history found for this admin",
      });
    }

    res.status(200).json({
      success: true,
      message: "Admin history fetched successfully",
      data: approvalHistory,
    });
  } catch (error) {
    console.error("Error fetching admin  history:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// Update Admin
export const updateAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Admin ID is required" });
    }

    if (!req.body.admin) {
      return res.status(400).json({ message: "No update data provided" });
    }

    const updates = { ...req.body.admin };

    // ✅ Remove empty fields so they won't overwrite
    Object.keys(updates).forEach((key) => {
      if (updates[key] === "" || updates[key] === null || updates[key] === undefined) {
        delete updates[key];
      }
    });

    // ✅ Handle password hashing
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    // ✅ Track who updated
    updates.updatedBy = req.admin?.id || null;

    // ✅ Update admin in DB
    const updatedAdmin = await admin.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("createdBy updatedBy", "name email role status");

    if (!updatedAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // ✅ Save audit log
    await adminAuditLog.findOneAndUpdate(
      { adminId: id },
      {
        $push: {
          history: {
            action: "Details Updated",
            actionBy: req.admin?.id,
            actionOn: new Date(),
            remark: req.body.remark || "Updated without remark",
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      message: "Admin updated successfully",
      data: updatedAdmin,
    });
  } catch (error: any) {
    console.error("Error updating admin:", error);
    return res.status(500).json({
      message: "Error updating admin",
      error: error.message,
    });
  }
};

// Activate Admin
export const activateAdmin = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const currentAdminId = req.admin.id;

    const foundAdmin = await admin.findById(id);
    if (!foundAdmin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    if (foundAdmin._id.toString() === currentAdminId) {
      return res.status(403).json({ success: false, message: "You cannot activate your own account" });
    }

    if (foundAdmin.status === "active") {
      return res.status(400).json({ success: false, message: "Admin is already active" });
    }

    foundAdmin.status = "active";
    foundAdmin.updatedBy = currentAdminId;
    await foundAdmin.save();

    // Populate updatedBy field
    const populatedAdmin = await admin.findById(foundAdmin._id)
      .populate("updatedBy", "name email role")
      .populate("createdBy", "name email role");

    res.status(200).json({
      success: true,
      message: "Admin activated successfully",
      data: populatedAdmin,
    });
  } catch (error) {
    console.error("Error activating admin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Deactivate Admin
export const deactivateAdmin = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const currentAdminId = req.admin.id;

    const foundAdmin = await admin.findById(id);
    if (!foundAdmin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    if (foundAdmin._id.toString() === currentAdminId) {
      return res.status(403).json({ success: false, message: "You cannot deactivate your own account" });
    }

    if (foundAdmin.status === "inactive") {
      return res.status(400).json({ success: false, message: "Admin is already inactive" });
    }

    foundAdmin.status = "inactive";
    foundAdmin.updatedBy = currentAdminId;
    await foundAdmin.save();

    // Populate updatedBy field
    const populatedAdmin = await admin.findById(foundAdmin._id)
      .populate("updatedBy", "name email role")
      .populate("createdBy", "name email role");
    res.status(200).json({
      success: true,
      message: "Admin deactivated successfully",
      data: populatedAdmin,
    });
  } catch (error) {
    console.error("Error deactivating admin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Transactions

export const getAllTransactions = async (req: Request, res: Response) => {
  try {
    const transactions = await Transaction.find()
      .sort({ actionOn: -1 })
      .populate({
        path: "driverId",        // the field in your Transaction schema
        // select: "name email phone_number vehicle_type registration_number", // fields you want to include
      });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No transactions found",
        data: [],
      });
    }

    console.log(transactions)

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (err) {
    console.error("Get All Transactions Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactionsInfo = async (req: Request, res: Response) => {
  try {
    // 1️⃣ All-time totals
    const allTimeStats = await Transaction.aggregate([
      { $match: { status: "success" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$netAmount" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);
    const allTime = allTimeStats[0] || { totalRevenue: 0, totalTransactions: 0 };

    // 2️⃣ This month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // This month totals
    const thisMonthStats = await Transaction.aggregate([
      { $match: { status: "success", actionOn: { $gte: thisMonthStart, $lte: now } } },
      {
        $group: {
          _id: null,
          revenueThisMonth: { $sum: "$netAmount" },
          transactionsThisMonth: { $sum: 1 },
        },
      },
    ]);
    const thisMonth = thisMonthStats[0] || { revenueThisMonth: 0, transactionsThisMonth: 0 };

    // Last month totals
    const lastMonthStats = await Transaction.aggregate([
      { $match: { status: "success", actionOn: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
      {
        $group: {
          _id: null,
          revenueLastMonth: { $sum: "$netAmount" },
          transactionsLastMonth: { $sum: 1 },
        },
      },
    ]);
    const lastMonth = lastMonthStats[0] || { revenueLastMonth: 0, transactionsLastMonth: 0 };

    // Calculate % changes for this month vs last month
    const revenueChange = lastMonth.revenueLastMonth
      ? ((thisMonth.revenueThisMonth - lastMonth.revenueLastMonth) / lastMonth.revenueLastMonth) * 100
      : 0;

    const transactionsChange = lastMonth.transactionsLastMonth
      ? ((thisMonth.transactionsThisMonth - lastMonth.transactionsLastMonth) / lastMonth.transactionsLastMonth) * 100
      : 0;

    res.status(200).json({
      totalRevenue: allTime.totalRevenue,
      totalTransactions: allTime.totalTransactions,
      revenueThisMonth: thisMonth.revenueThisMonth,
      transactionsThisMonth: thisMonth.transactionsThisMonth,
      revenueLastMonth: lastMonth.revenueLastMonth,
      transactionsLastMonth: lastMonth.transactionsLastMonth,
      revenueChange,
      transactionsChange,
    });
  } catch (err) {
    console.error("Dashboard Transactions Info Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Rides
export const getRides = async (req: Request, res: Response) => {
  try {
    const rides = await Ride.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "driverId",
      })
      .populate({
        path: "userId"
      });

    if (!rides || rides.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No rides found",
        data: [],
      });
    }

    console.log(rides)

    res.status(200).json({
      success: true,
      data: rides,
    });
  } catch (err) {
    console.error("Get All Rides Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
