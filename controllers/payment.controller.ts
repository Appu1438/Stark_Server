import Razorpay from "razorpay";
import { driver, DriverWallet, Transaction } from "../db/schema";
import { Request, Response } from "express";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ✅ Create Razorpay Order
// ✅ Create Order (NO DB WRITE HERE)
export const createOrder = async (req: Request, res: Response) => {
  try {
    const { amount, driverId } = req.body;

    if (!amount || !driverId) {
      return res.status(400).json({ message: "Amount and Driver ID required" });
    }

    // 🟡 1. Get driver details
    const Driver = await driver.findById(driverId);

    if (!Driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    // Minimum recharge based on vehicle type
    const minRecharge =
      Driver.vehicle_type === "Auto" ? 500 : 2000;

    // 🟡 2. Check wallet for first recharge
    const driverWallet = await DriverWallet.findOne({ driverId });

    const isFirstRecharge =
      !driverWallet || !driverWallet.history || driverWallet.history.length === 0;

    if (isFirstRecharge && amount < minRecharge) {
      return res.status(400).json({
        success: false,
        message: `Your first wallet recharge must be ₹${minRecharge} or more.`,
      });
    }

    // 🟢 3. Create Razorpay order
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { driverId },
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id,
      amount,
    });
  } catch (error) {
    console.error("Razorpay create order error:", error);
    res.status(500).json({ message: "Order creation failed", error });
  }
};

// ✅ Verify Payment (CREATE TRANSACTION ONLY ON SUCCESS)
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const crypto = require("crypto");
    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    // ✅ Fetch order details
    const orderDetails = await razorpay.orders.fetch(razorpay_order_id);

    const driverId = orderDetails.notes.driverId;

    // Gross amount paid by the user (INR)
    const grossAmount = orderDetails.amount / 100;

    // Calculate net amount (wallet credit) after 2% Razorpay fee + 18% GST on fee
    // Formula: net = gross / (1 + fee% * (1 + GST%))
    const netAmount = parseFloat((grossAmount / (1 + 0.02 * (1 + 0.18))).toFixed(2));

    console.log(grossAmount)
    console.log(netAmount)

    // ✅ Create transaction record (optional, if you want to track all gateway transactions)

    const updatedWallet = await DriverWallet.findOneAndUpdate(
      { driverId },
      [
        {
          $set: {
            // Increment balance
            balance: { $add: ["$balance", netAmount] },
            // Append history entry with balanceAfter
            history: {
              $concatArrays: [
                "$history",
                [
                  {
                    type: "credit",
                    action: "recharge",
                    amount: netAmount,
                    referenceId: razorpay_order_id,
                    meta: { razorpay_payment_id, grossAmount },
                    balanceAfter: { $add: ["$balance", netAmount] },
                    actionOn: new Date(),
                  },
                ],
              ],
            },
          },
        },
      ],
      { upsert: true, new: true }
    );
    await Transaction.create({
      driverId,
      grossAmount,
      netAmount,
      paymentId: razorpay_order_id,
      status: "success",
      details: { razorpay_payment_id, razorpay_signature },
    });

    // ✅ Update wallet balance & push history atomically


    return res.json({
      message: "Wallet recharged successfully",
      wallet: updatedWallet?.balance,
    });
  } catch (error) {
    console.error("Razorpay verify error:", error);
    res.status(500).json({ message: "Payment verification failed", error });
  }
};
