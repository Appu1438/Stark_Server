import express from "express";
import { isAuthenticated, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { createOrder, createPaymentLink, razorpayWebhook, verifyPayment } from "../controllers/payment.controller";

const paymentRouter = express.Router();

paymentRouter.post('/create-order', isAuthenticatedDriver, createOrder)
paymentRouter.post('/verify-payment', isAuthenticatedDriver, verifyPayment)

paymentRouter.post("/create-payment-link", isAuthenticatedDriver, createPaymentLink)
paymentRouter.post('/webhook', isAuthenticatedDriver, razorpayWebhook)


export default paymentRouter;