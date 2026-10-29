import { apiRequest } from "./client";

export const doctorApi = {
  listDoctors: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    if (params.specialization) query.append("specialization", params.specialization);
    const queryString = query.toString() ? `?${query.toString()}` : "";
    return apiRequest(`/doctors/${queryString}`);
  },
  getDoctorById: (doctorId) => apiRequest(`/doctors/${doctorId}`),
  updateDoctorProfile: (doctorId, data) =>
    apiRequest(`/doctors/${doctorId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  toggleDoctorStatus: (doctorId, status) =>
    apiRequest(`/doctors/${doctorId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  getMySchedule: () => apiRequest("/doctors/me/schedule"),
  getMyAssignedPatients: () => apiRequest("/doctors/me/patients"),
};
