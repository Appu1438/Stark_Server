require("dotenv").config();
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import userRouter from "./routes/user.route";
import driverRouter from "./routes/driver.route";
import Nylas from "nylas";
import adminRouter from "./routes/admin.route";
import cors from "cors";
import paymentRouter from "./routes/payment.route";
const connectDB = require("./db/connect");
import sessionRouter from "./routes/session.route";
import fareRouter from "./routes/fare.route";
import rideRouter from "./routes/ride.route";
import complaintRouter from "./routes/complaint.route";

export const app = express();

export const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: "https://api.us.nylas.com",
});

// body parser
app.use(express.json({ limit: "50mb" }));

// cookie parserv
app.use(cookieParser());

// enable cors
app.use(cors({
  origin: [
    "http://192.168.1.2:3000",
    "http://192.168.1.2:5000",
    "http://192.168.1.2:8081",
    "http://192.168.1.2:8082"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true, // ✅ required for cookies
}));


// connect to DB
connectDB();


// routes
app.use("/api/v1", userRouter);
app.use("/api/v1/driver", driverRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/session", sessionRouter);
app.use("/api/v1/fare", fareRouter);
app.use("/api/v1/ride", rideRouter);
app.use("/api/v1/complaints", complaintRouter);

// testing api
app.get("/test", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    succcess: true,
    message: "API is working",
  });
});