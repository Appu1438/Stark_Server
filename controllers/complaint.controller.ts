import { Complaint, driver, User } from "../db/schema";

export const getUserComplaints = async (req: any, res: any) => {
    try {
        console.log('hello')
        const complaints = await Complaint.find({ registeredBy: req.user.id })
            .populate("ride")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: complaints });
    } catch (error) {
        console.error("Fetch complaints failed:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const createUserComplaint = async (req: any, res: any) => {
    try {
        const { category, message, rideId } = req.body;
        console.log(req.body)


        if (!category || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const complaint = new Complaint({
            registeredBy: req.user.id,   // from your checktoken middleware
            userType: "user",            // fixed type
            ride: rideId || null,        // optional
            category,
            message,
        });

        await complaint.save();


        const populatedComplaint = await Complaint.findById(complaint._id)
            .populate("ride");

        console.log(populatedComplaint)

        return res.status(201).json({
            success: true,
            message: "User complaint registered successfully",
            data: populatedComplaint,
        });
    } catch (error) {
        console.error("User complaint creation failed:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getDriverComplaints = async (req: any, res: any) => {
    try {
        const complaints = await Complaint.find({ registeredBy: req.driver.id })
            .populate("ride")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: complaints });
    } catch (error) {
        console.error("Fetch complaints failed:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const createDriverComplaint = async (req: any, res: any) => {
    try {
        const { category, message, rideId } = req.body;

        if (!category || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const complaint = new Complaint({
            registeredBy: req.driver.id,
            userType: "driver",
            ride: rideId || null,
            category,
            message,
        });

        await complaint.save();

        const populatedComplaint = await Complaint.findById(complaint._id)
            .populate("ride");

        console.log(populatedComplaint)

        return res.status(201).json({
            success: true,
            message: "Driver complaint registered successfully",
            data: populatedComplaint,
        });
    } catch (error) {
        console.error("Driver complaint creation failed:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getAllComplaintsForAdmin = async (req: any, res: any) => {
    try {
        const complaints = await Complaint.find()
            .populate("registeredBy")
            .populate("ride")
            .populate("adminHandledBy") // 👈 important
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: complaints,
        });
    } catch (error) {
        console.error("Admin fetch complaints failed:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};


export const markComplaintInReview = async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const adminId = req.admin.id;

        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found" });
        }

        if (complaint.status !== "Pending") {
            return res.status(400).json({
                message: "Only pending complaints can be marked as In Review",
            });
        }

        complaint.status = "In Review";
        complaint.adminHandledBy = adminId;

        await complaint.save();

        // 🔥 Re-fetch populated complaint
        const populatedComplaint = await Complaint.findById(complaint._id)
            .populate("registeredBy")
            .populate("ride")
            .populate("adminHandledBy");

        return res.status(200).json({
            success: true,
            message: "Complaint marked as In Review",
            data: populatedComplaint,
        });
    } catch (error) {
        console.error("Mark In Review failed:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const resolveComplaint = async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const { adminResponse } = req.body;
        const adminId = req.admin.id;

        console.log(id, adminResponse, adminId)

        if (!adminResponse || !adminResponse.trim()) {
            return res.status(400).json({
                message: "Admin response is required to resolve the complaint",
            });
        }

        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found" });
        }

        if (complaint.status !== "In Review") {
            return res.status(400).json({
                message: "Only complaints in review can be resolved",
            });
        }

        if (
            !complaint.adminHandledBy ||
            complaint.adminHandledBy.toString() !== adminId
        ) {
            return res.status(403).json({
                message: "You are not authorized to resolve this complaint",
            });
        }

        complaint.status = "Resolved";
        complaint.adminResponse = adminResponse;
        complaint.resolvedAt = new Date();

        await complaint.save();

        // 🔥 Re-fetch populated complaint
        const populatedComplaint = await Complaint.findById(complaint._id)
            .populate("registeredBy")
            .populate("ride")
            .populate("adminHandledBy");

        return res.status(200).json({
            success: true,
            message: "Complaint resolved successfully",
            data: populatedComplaint,
        });
    } catch (error) {
        console.error("Resolve complaint failed:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

