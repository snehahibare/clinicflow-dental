import { apiRequest } from "./client";

export const patientApi = {
  getMyProfile: () => apiRequest("/patients/me"),
  updateMyProfile: (data) =>
    apiRequest("/patients/me", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getMyRecords: () => apiRequest("/patients/me/records"),
  getMyBills: () => apiRequest("/patients/me/bills"),
  searchPatients: (query = "") =>
    apiRequest(`/patients/search?q=${encodeURIComponent(query)}`),
  getPatientById: (patientId) => apiRequest(`/patients/${patientId}`),
};
