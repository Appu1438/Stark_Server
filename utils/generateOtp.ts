// Utility function for OTP
export function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000); // 4-digit OTP
}