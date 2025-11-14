import { Complaint } from "../db/schema";

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
            userType: "User",            // fixed type
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
            userType: "Driver",
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

