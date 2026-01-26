import crypto from "crypto";

export const hashOtp = (otp: string) =>
  crypto.createHash("sha256").update(otp).digest("hex");
