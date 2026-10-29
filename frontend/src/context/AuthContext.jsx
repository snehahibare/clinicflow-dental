import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("dcms_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const persistSession = (tokenResponse) => {
    localStorage.setItem("dcms_access_token", tokenResponse.access_token);
    localStorage.setItem("dcms_refresh_token", tokenResponse.refresh_token);
    localStorage.setItem("dcms_user", JSON.stringify(tokenResponse.user));
    setUser(tokenResponse.user);
  };

  const logout = () => {
    localStorage.removeItem("dcms_access_token");
    localStorage.removeItem("dcms_refresh_token");
    localStorage.removeItem("dcms_user");
    setUser(null);
  };

  useEffect(() => {
    const handleLogoutEvent = () => logout();
    window.addEventListener("dcms_logout", handleLogoutEvent);
    return () => window.removeEventListener("dcms_logout", handleLogoutEvent);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("dcms_access_token");
    if (!token) {
      setLoading(false);
      return;
    }

    authApi
      .getMe()
      .then((userData) => {
        setUser(userData);
        localStorage.setItem("dcms_user", JSON.stringify(userData));
      })
      .catch((err) => {
        console.warn("Session verification error:", err.message);
        logout();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const loginWithPassword = async (emailOrPhone, password) => {
    const res = await authApi.login(emailOrPhone, password);
    persistSession(res);
    return res.user;
  };

  const loginWithOtp = async (phone, otpCode) => {
    const res = await authApi.verifyOtp(phone, otpCode);
    persistSession(res);
    return res.user;
  };

  const registerPatient = async (patientData) => {
    const res = await authApi.register(patientData);
    persistSession(res);
    return res.user;
  };

  const refreshUserProfile = async () => {
    const userData = await authApi.getMe();
    setUser(userData);
    localStorage.setItem("dcms_user", JSON.stringify(userData));
    return userData;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role,
        isAuthenticated: !!user,
        loading,
        loginWithPassword,
        loginWithOtp,
        registerPatient,
        logout,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
