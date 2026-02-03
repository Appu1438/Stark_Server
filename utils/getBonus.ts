export const getRegistrationBonus = (vehicleType: string) => {
  if (vehicleType === "Auto") {
    return Math.floor(Math.random() * (250 - 100 + 1)) + 100;
  }
  return Math.floor(Math.random() * (500 - 250 + 1)) + 250;
};
