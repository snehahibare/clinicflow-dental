import { apiRequest } from "./client";

export const appointmentApi = {
  getAvailableSlots: (doctorId, dateStr) =>
    apiRequest(`/appointments/available-slots?doctor_id=${doctorId}&date=${dateStr}`),

  bookAppointment: (payload) =>
    apiRequest("/appointments/book", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMyAppointments: () => apiRequest("/appointments/my"),

  rescheduleAppointment: (appointmentId, payload) =>
    apiRequest(`/appointments/${appointmentId}/reschedule`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancelAppointment: (appointmentId, payload) => {
    const body = typeof payload === "string" 
      ? { cancellation_reason: payload }
      : { cancellation_reason: payload?.cancellation_reason || payload?.reason || "" };
    return apiRequest(`/appointments/${appointmentId}/cancel`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getDoctorSchedule: (dateStr) => {
    const query = dateStr ? `?date=${dateStr}` : "";
    return apiRequest(`/appointments/doctor/schedule${query}`);
  },

  getAdminSchedule: (dateStr, doctorId) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date", dateStr);
    if (doctorId) params.append("doctor_id", doctorId);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/appointments/admin/schedule${queryString}`);
  },

  adminBookAppointment: (payload) =>
    apiRequest("/appointments/admin/book", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminReassignAppointment: (appointmentId, payload) =>
    apiRequest(`/appointments/admin/${appointmentId}/reassign`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getReassignmentsNeeded: () =>
    apiRequest("/appointments/admin/reassignments-needed"),

  getAdminWeekSchedule: (startDateStr, doctorId) => {
    const params = new URLSearchParams();
    if (startDateStr) params.append("start_date", startDateStr);
    if (doctorId) params.append("doctor_id", doctorId);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/appointments/admin/schedule/week${queryString}`);
  },
};
