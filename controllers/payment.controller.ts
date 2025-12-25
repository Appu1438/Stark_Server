import Razorpay from "razorpay";
import { driver, DriverWallet, Transaction } from "../db/schema";
import { Request, Response } from "express";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const activeOrders = new Map<string, number>();


// ✅ Create Razorpay Order
export const createOrder = async (req: Request, res: Response) => {
  try {
    const { amount, driverId } = req.body;

    if (!amount || !driverId) {
      return res.status(400).json({ message: "Amount and Driver ID required" });
    }

    // 🔒 PREVENT MULTIPLE ORDER CREATION (30 sec lock)
    const lastOrderTime = activeOrders.get(driverId);
    if (lastOrderTime && Date.now() - lastOrderTime < 30_000) {
      return res.status(429).json({
        message: "Payment already in progress. Please wait.",
      });
    }

    activeOrders.set(driverId, Date.now());

    // 🟡 Get driver
    const Driver = await driver.findById(driverId);
    if (!Driver) {
      activeOrders.delete(driverId);
      return res.status(404).json({ message: "Driver not found" });
    }

    const minRecharge = Driver.vehicle_type === "Auto" ? 500 : 2000;

    const driverWallet = await DriverWallet.findOne({ driverId });
    const isFirstRecharge =
      !driverWallet || !driverWallet.history || driverWallet.history.length === 0;

    if (isFirstRecharge && amount < minRecharge) {
      activeOrders.delete(driverId);
      return res.status(400).json({
        message: `Your first wallet recharge must be ₹${minRecharge} or more.`,
      });
    }

    // 🟢 Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { driverId },
    });

    res.json({
      success: true,
      orderId: order.id,
      amount,
    });

    // 🔓 Auto-release lock after 30 sec
    setTimeout(() => activeOrders.delete(driverId), 30_000);
  } catch (error) {
    console.error("Razorpay create order error:", error);
    res.status(500).json({ message: "Order creation failed" });
  }
};

// ✅ Verify Payment (CREATE TRANSACTION ONLY ON SUCCESS)
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const crypto = require("crypto");

    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    // 🔒 DUPLICATE PAYMENT CHECK (ABSOLUTE SAFETY)
    const existingTx = await Transaction.findOne({
      paymentId: razorpay_order_id,
    });

    if (existingTx) {
      return res.json({
        message: "Payment already processed",
        wallet: existingTx.netAmount,
      });
    }

    const orderDetails = await razorpay.orders.fetch(razorpay_order_id);
    const driverId = orderDetails.notes.driverId;

    const grossAmount = orderDetails.amount / 100;

    // Net wallet credit
    const netAmount = parseFloat(
      (grossAmount / (1 + 0.02 * 1.18)).toFixed(2)
    );

    // ✅ ATOMIC WALLET UPDATE
    const updatedWallet = await DriverWallet.findOneAndUpdate(
      { driverId },
      [
        {
          $set: {
            balance: { $add: ["$balance", netAmount] },
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

    return res.json({
      message: "Wallet recharged successfully",
      wallet: updatedWallet?.balance,
    });
  } catch (error: any) {
    // 🔥 Handles duplicate key error safely
    if (error.code === 11000) {
      return res.json({ message: "Payment already processed" });
    }

    console.error("Razorpay verify error:", error);
    res.status(500).json({ message: "Payment verification failed" });
  }
};

