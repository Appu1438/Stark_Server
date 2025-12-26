import express from "express";
import { isAuthenticated, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { createOrder, createPaymentLink, razorpayWebhook, verifyPayment } from "../controllers/payment.controller";
import { checkDriverDevice } from "../middleware/checkDevice";
import { checkDriverApproval } from "../middleware/checkDriverApproval";

const paymentRouter = express.Router();

paymentRouter.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    razorpayWebhook
);

paymentRouter.use(express.json({ limit: "50mb" }));

paymentRouter.post('/create-order', isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, createOrder)
paymentRouter.post('/verify-payment', isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, verifyPayment)

paymentRouter.post("/create-payment-link", isAuthenticatedDriver, checkDriverDevice, checkDriverApproval, createPaymentLink)


export default paymentRouter;