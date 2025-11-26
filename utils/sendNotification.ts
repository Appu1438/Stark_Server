// utils/notifications.ts
import axios from "axios";

export const sendPushNotification = async (
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
) => {
  try {
    const message = {
      to: expoPushToken,
      sound: "default",
      title,
      body,
      data, // optional payload
    };

    console.log(message)

    await axios.post("https://exp.host/--/api/v2/push/send", message);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};
