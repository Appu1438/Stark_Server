import Razorpay from "razorpay";
import { driver, DriverWallet, DriverWalletHistory, Transaction } from "../db/schema";
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

    const options = {
      amount: amount * 100, // smallest unit (paise)
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { driverId },
    };

    const order = await razorpay.orders.create(options);

    res.json({
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
    const amount = orderDetails.amount / 100; // Convert to INR

    // ✅ Create transaction record (optional, if you want to track all gateway transactions)

    const updatedWallet = await DriverWallet.findOneAndUpdate(
      { driverId },
      [
        {
          $set: {
            // Increment balance
            balance: { $add: ["$balance", amount] },
            // Append history entry with balanceAfter
            history: {
              $concatArrays: [
                "$history",
                [
                  {
                    type: "credit",
                    action: "recharge",
                    amount,
                    referenceId: razorpay_order_id,
                    meta: { razorpay_payment_id },
                    balanceAfter: { $add: ["$balance", amount] },
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
      amount,
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
