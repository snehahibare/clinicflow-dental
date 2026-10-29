import { apiRequest } from "./client";

export const treatmentApi = {
  createTreatmentRecord: (appointmentId, payload) =>
    apiRequest(`/treatments/appointment/${appointmentId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTreatmentRecord: (appointmentId, payload) =>
    apiRequest(`/treatments/appointment/${appointmentId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getTreatmentRecord: (appointmentId) =>
    apiRequest(`/treatments/appointment/${appointmentId}`),

  getDoctorFollowUps: () =>
    apiRequest("/treatments/doctor/follow-ups"),
};
