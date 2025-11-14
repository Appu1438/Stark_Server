import { Request, Response } from "express";
import { Fare } from "../db/schema";

export const calculateFare = async (req: Request, res: Response) => {
  try {
    console.log(req.body)
    const { vehicle_type, distance, district } = req.body;

    if (!vehicle_type || distance === undefined || distance === null) {
      console.log("Vehicle type and distance are required");
      return res.status(400).json({ message: "Vehicle type and distance are required" });
    }


    // 1️⃣ Fetch fare details
    let fare = await Fare.findOne({ vehicle_type, district });
    if (!fare) {
      // fallback to default district config
      fare = await Fare.findOne({ vehicle_type, district: "Default" });
      if (!fare) {
        return res.status(404).json({ message: "Fare details not found for vehicle type" });
      }
    }

    // 2️⃣ Perform calculation
    const rawFare =
      fare.baseFare +
      distance * fare.perKmRate


    const surgedFare = rawFare * fare.surgeMultiplier;
    const totalFare = Math.max(surgedFare, fare.minFare);

    const roundedFare = Math.round(totalFare);

    // 3️⃣ Calculate platform share (15%) & driver earnings
    const platformShare = Math.round(roundedFare * 0.15);
    const driverEarnings = roundedFare - platformShare;

    res.status(200).json({
      success: true,
      data: {
        totalFare: roundedFare,
        platformShare,
        driverEarnings,
        fareDetails: fare, // sending back for reference
      },
    });
  } catch (error) {
    console.error("Error calculating fare:", error);
    res.status(500).json({ message: "Error calculating fare", error });
  }
};

export const getFareByVehicleType = async (req: Request, res: Response) => {
  try {
    const { vehicle_type, district } = req.params; // e.g., "Sedan", "Hatchback"
    console.log(req.params)

    if (!vehicle_type) {
      return res.status(400).json({ success: false, message: "Vehicle type is required." });
    }

    // Fetch the active fare for the vehicle type
    let fare = await Fare.findOne({ vehicle_type, district });

    if (!fare) {
      fare = await Fare.findOne({ vehicle_type, district: "Default" });
      if (!fare) {
        return res.status(404).json({
          success: false,
          message: `Fare details not found for vehicle type: ${vehicle_type}`,
        });
      }
    }

    res.status(200).json({
      success: true,
      fare,
    });
  } catch (error) {
    console.error("Fetch fare error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching fare details.",
    });
  }
};


export const createFare = async (req: Request, res: Response) => {
  try {
    console.log(req.body)
    const {
      vehicle_type,
      baseFare,
      perKmRate,
      perMinRate,
      minFare,
      surgeMultiplier,
      district,
    } = req.body;

    if (!vehicle_type) {
      return res.status(400).json({ success: false, message: "Vehicle type is required." });
    }

    // Check if fare already exists for this vehicle type and district
    const existingFare = await Fare.findOne({ vehicle_type, district });

    if (existingFare) {
      return res.status(409).json({
        success: false,
        message: "Fare for this vehicle type and district already exists.",
      });
    }

    // Create new fare
    const newFare = new Fare({
      vehicle_type,
      baseFare: baseFare ?? parseFloat(process.env[`BASEFARE_${vehicle_type.toUpperCase()}`] || "0"),
      perKmRate: perKmRate ?? parseFloat(process.env[`PERKM_${vehicle_type.toUpperCase()}`] || "0"),
      perMinRate: perMinRate ?? parseFloat(process.env[`PERMIN_${vehicle_type.toUpperCase()}`] || "0"),
      minFare: minFare ?? parseFloat(process.env[`MINFARE_${vehicle_type.toUpperCase()}`] || "0"),
      surgeMultiplier: surgeMultiplier ?? 1,
      district: district ?? "Alappuzha",
    });

    await newFare.save();
    return res.status(201).json({ success: true, message: "Fare created successfully.", data: newFare });
  } catch (error) {
    console.error("Fare creation error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

export const updateFare = async (req: Request, res: Response) => {
  try {
    console.log(req.body)
    const {
      vehicle_type,
      baseFare,
      perKmRate,
      perMinRate,
      minFare,
      surgeMultiplier,
      district,
    } = req.body;

    if (!vehicle_type) {
      return res.status(400).json({ success: false, message: "Vehicle type is required." });
    }

    const fare = await Fare.findOne({ vehicle_type, district });

    if (!fare) {
      return res.status(404).json({
        success: false,
        message: "Fare not found for this vehicle type and district.",
      });
    }

    // Update fare details
    fare.baseFare = baseFare ?? fare.baseFare;
    fare.perKmRate = perKmRate ?? fare.perKmRate;
    fare.perMinRate = perMinRate ?? fare.perMinRate;
    fare.minFare = minFare ?? fare.minFare;
    fare.surgeMultiplier = surgeMultiplier ?? fare.surgeMultiplier;
    fare.district = district ?? fare.district;

    await fare.save();

    return res.status(200).json({ success: true, message: "Fare updated successfully.", data: fare });
  } catch (error) {
    console.error("Fare update error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};
// Fares
export const getFares = async (req: Request, res: Response) => {
  try {
    const fares = await Fare.find()
      .sort({ createdAt: -1 })

    if (!fares || fares.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No fares found",
        data: [],
      });
    }

    console.log(fares)

    res.status(200).json({
      success: true,
      data: fares,
    });
  } catch (err) {
    console.error("Get All Fares Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
