import { Request, Response } from "express";
import { Fare } from "../db/schema";

export const calculateFare = async (req: Request, res: Response) => {
  try {
    const { vehicle_type, distance, district } = req.body;

    if (!vehicle_type || distance == null) {
      return res.status(400).json({ message: "Vehicle type and distance are required" });
    }

    // Fetch fare config
    let fare = await Fare.findOne({ vehicle_type, district });
    if (!fare) {
      fare = await Fare.findOne({ vehicle_type, district: "Default" });
      if (!fare) {
        return res.status(404).json({ message: "Fare details not found" });
      }
    }

    // -----------------------------------------
    // 🌙 NIGHT TIME CHECK
    // -----------------------------------------
    const currentHour = new Date().getHours();

    const isNight =
      fare.nightStart > fare.nightEnd
        ? currentHour >= fare.nightStart || currentHour < fare.nightEnd
        : currentHour >= fare.nightStart && currentHour < fare.nightEnd;

    // -----------------------------------------
    // 1️⃣ Base Fare Calculation
    // -----------------------------------------
    let rawFare = 0;

    if (distance <= fare.baseFareUptoKm) {
      rawFare = fare.baseFare;
    } else {
      const extraKm = distance - fare.baseFareUptoKm;
      rawFare = fare.baseFare + extraKm * fare.perKmRate;
    }

    // -----------------------------------------
    // 2️⃣ Apply normal surge
    // -----------------------------------------
    rawFare = rawFare * fare.surgeMultiplier;

    // -----------------------------------------
    // 3️⃣ Apply night surge 🌙
    // -----------------------------------------
    if (isNight) {
      rawFare = rawFare * fare.nightMultiplier;
    }

    const baseFare = Math.round(rawFare);

    // -----------------------------------------
    // 4️⃣ TAX (5%) added to USER payment
    // -----------------------------------------
    const taxAmount = Math.round(baseFare * 0.05);

    // -----------------------------------------
    // 5️⃣ Platform Fee (10%)
    // -----------------------------------------
    const platformFee = Math.round(baseFare * 0.10);

    const userPayable = baseFare + taxAmount;


    // -----------------------------------------
    // 6️⃣ Total deductions
    // -----------------------------------------
    const totalDeductions = platformFee + taxAmount;

    // -----------------------------------------
    // 7️⃣ Driver Earnings
    // -----------------------------------------
    const driverEarnings = userPayable - totalDeductions;

    return res.status(200).json({
      success: true,
      data: {
        totalFare: userPayable,
        platformShare: totalDeductions,
        driverEarnings,

        // 🔥 extra info (very useful for UI)
        isNightChargeApplied: isNight,
        nightMultiplier: isNight ? fare.nightMultiplier : 1,

        fareDetails: fare,
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
    const {
      vehicle_type,
      baseFare,
      baseFareUptoKm,
      perKmRate,
      perMinRate,
      surgeMultiplier,
      district,
    } = req.body;

    if (!vehicle_type || !district) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type and district are required",
      });
    }

    const existingFare = await Fare.findOne({ vehicle_type, district });

    if (existingFare) {
      return res.status(409).json({
        success: false,
        message: "Fare already exists for this vehicle type and district",
      });
    }

    const newFare = new Fare({
      vehicle_type,
      baseFare,
      baseFareUptoKm,
      perKmRate,
      perMinRate,
      surgeMultiplier: surgeMultiplier ?? 1,
      district,
    });

    await newFare.save();

    return res.status(201).json({
      success: true,
      message: "Fare created successfully",
      data: newFare,
    });
  } catch (error) {
    console.error("Fare creation error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const updateFare = async (req: Request, res: Response) => {
  try {
    const {
      vehicle_type,
      district,
      baseFare,
      baseFareUptoKm,
      perKmRate,
      perMinRate,
      surgeMultiplier,
    } = req.body;

    if (!vehicle_type || !district) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type and district are required",
      });
    }

    const fare = await Fare.findOne({ vehicle_type, district });

    if (!fare) {
      return res.status(404).json({
        success: false,
        message: "Fare not found",
      });
    }

    fare.baseFare = baseFare ?? fare.baseFare;
    fare.baseFareUptoKm = baseFareUptoKm ?? fare.baseFareUptoKm;
    fare.perKmRate = perKmRate ?? fare.perKmRate;
    fare.perMinRate = perMinRate ?? fare.perMinRate;
    fare.surgeMultiplier = surgeMultiplier ?? fare.surgeMultiplier;

    await fare.save();

    return res.status(200).json({
      success: true,
      message: "Fare updated successfully",
      data: fare,
    });
  } catch (error) {
    console.error("Fare update error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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
