import express from "express";
import { isAuthenticated, isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { createOrder, verifyPayment } from "../controllers/payment.controller";

const paymentRouter = express.Router();

paymentRouter.post('/create-order', isAuthenticatedDriver, createOrder)
paymentRouter.post('/verify-payment', isAuthenticatedDriver, verifyPayment)


export default paymentRouter;