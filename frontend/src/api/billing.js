import { apiRequest } from "./client";

export const billingApi = {
  getBillingOverview: (status) => {
    const query = status && status !== "all" ? `?status=${status}` : "";
    return apiRequest(`/billing/overview${query}`);
  },

  updateBillStatus: (billId, payload) =>
    apiRequest(`/billing/${billId}/status`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getMyBills: () => apiRequest("/patients/me/bills"),
};
