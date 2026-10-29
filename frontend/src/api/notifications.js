import { apiRequest } from "./client";

export const notificationsApi = {
  getFailedNotifications: () =>
    apiRequest("/notifications/failed", {
      method: "GET",
    }),

  retryNotification: (notificationId) =>
    apiRequest(`/notifications/${notificationId}/retry`, {
      method: "POST",
    }),

  trigger24hReminders: (targetDate = null) => {
    const query = targetDate ? `?target_date=${targetDate}` : "";
    return apiRequest(`/notifications/run-reminders${query}`, {
      method: "POST",
    });
  },

  getAllNotifications: (limit = 50) =>
    apiRequest(`/notifications/all?limit=${limit}`, {
      method: "GET",
    }),
};
