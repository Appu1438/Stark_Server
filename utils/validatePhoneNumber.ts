export const isValidPhoneNumber = (phone: string) => {
  // India only: +91 followed by 10 digits starting 6–9
  return /^\+91[6-9]\d{9}$/.test(phone);
};
