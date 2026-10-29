import { apiRequest } from "./client";

export const authApi = {
  register: (patientData) =>
    apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(patientData),
    }),

  login: (emailOrPhone, password) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email_or_phone: emailOrPhone, password }),
    }),

  requestOtp: (phone) =>
    apiRequest("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone, otpCode) =>
    apiRequest("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, otp_code: otpCode }),
    }),

  getMe: () => apiRequest("/auth/me"),

  updateMe: (data) =>
    apiRequest("/auth/me", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  changePassword: (currentPassword, newPassword) =>
    apiRequest("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),

  forgotPassword: (email) =>
    apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token, newPassword) =>
    apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  createStaffUser: (staffData) =>
    apiRequest("/admin/users/", {
      method: "POST",
      body: JSON.stringify(staffData),
    }),

  listStaffUsers: () => apiRequest("/admin/users/"),
};
