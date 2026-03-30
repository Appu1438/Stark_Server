export const generateReferralCode = (name: any, phone: any) => {
    const namePart = name ? name.substring(0, 3).toUpperCase() : "DRV";
    const phonePart = phone ? phone.slice(-4) : Math.floor(1000 + Math.random() * 9000);
    const randomPart = Math.floor(100 + Math.random() * 900);

    return `${namePart}${phonePart}${randomPart}`;
};