import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/auth";
import { ForgotPasswordModal } from "../components/ForgotPasswordModal";
import { LogIn, Phone, KeyRound, AlertCircle, Sparkles } from "lucide-react";

export function LoginPage({ onNavigate }) {
  const { loginWithPassword, loginWithOtp } = useAuth();
  const [tab, setTab] = useState("password"); // "password" | "otp"
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  
  // OTP state
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [debugOtp, setDebugOtp] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(emailOrPhone, password);
      onNavigate("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.requestOtp(otpPhone);
      setOtpSent(true);
      if (res.data?.debug_otp) {
        setDebugOtp(res.data.debug_otp);
        setOtpCode(res.data.debug_otp); // Pre-fill debug code for effortless testing
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithOtp(otpPhone, otpCode);
      onNavigate("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const autofillAdmin = () => {
    setTab("password");
    setEmailOrPhone("admin@dcmsclinic.com");
    setPassword("AdminSecurePass123!");
  };

  return (
    <div className="auth-wrapper">
      <div className="card auth-card animate-fade-in" style={{ padding: "2.25rem 2rem", maxWidth: 440, width: "100%", margin: "3rem auto" }}>
        <div className="auth-header" style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.2rem", fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
            DCMS
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Sign in to access your dental records and clinical portal
          </p>
        </div>

        {error && (
          <div className="alert alert-error" id="login-error-alert" style={{ marginBottom: "1.25rem" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="tab-group" style={{ marginBottom: "1.5rem" }}>
          <button
            type="button"
            className={`tab-btn ${tab === "password" ? "active" : ""}`}
            onClick={() => {
              setTab("password");
              setError(null);
            }}
            id="tab-password-btn"
          >
            <KeyRound size={14} style={{ display: "inline", marginRight: 6 }} />
            Password sign in
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "otp" ? "active" : ""}`}
            onClick={() => {
              setTab("otp");
              setError(null);
            }}
            id="tab-otp-btn"
          >
            <Phone size={14} style={{ display: "inline", marginRight: 6 }} />
            Patient OTP sign in
          </button>
        </div>

        {tab === "password" ? (
          <form onSubmit={handlePasswordLogin}>
            <div className="form-group">
              <label className="form-label">Email or phone number</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="name@example.com or +15551234567"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                id="login-identifier-input"
              />
            </div>

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => setShowForgotModal(true)}
                  id="forgot-password-link"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                id="login-password-input"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              id="login-submit-btn"
              style={{ marginTop: "0.75rem" }}
            >
              <LogIn size={16} />
              {loading ? "Authenticating..." : "Sign in"}
            </button>

            <div style={{ marginTop: "1.25rem", padding: "0.75rem 1rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Demo staff access:</span>
                <button
                  type="button"
                  onClick={autofillAdmin}
                  className="btn btn-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                  id="autofill-admin-btn"
                >
                  <Sparkles size={12} /> Auto-fill admin
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div>
            {!otpSent ? (
              <form onSubmit={handleRequestOtp}>
                <div className="form-group">
                  <label className="form-label">Registered patient phone number</label>
                  <input
                    type="tel"
                    required
                    className="form-input"
                    placeholder="+15551234567"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value)}
                    id="otp-phone-input"
                  />
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                    We will send a 6-digit verification code to your phone.
                  </p>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                  id="request-otp-btn"
                >
                  {loading ? "Sending OTP..." : "Send verification code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                {debugOtp && (
                  <div className="alert alert-info" id="debug-otp-banner" style={{ marginBottom: "1rem" }}>
                    <Sparkles size={15} />
                    <span>Dev OTP code: <strong>{debugOtp}</strong> (expires in 5m)</span>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Enter 6-digit code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    className="form-input"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    id="otp-code-input"
                    style={{ fontSize: "1.25rem", letterSpacing: "0.25em", textAlign: "center" }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                  id="verify-otp-submit-btn"
                >
                  {loading ? "Verifying..." : "Verify and sign in"}
                </button>

                <div style={{ marginTop: "1rem", textAlign: "center" }}>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "0.825rem", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                    }}
                  >
                    Change phone number
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div style={{ marginTop: "1.75rem", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            New patient?{" "}
            <button
              type="button"
              style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => onNavigate("register")}
              id="goto-register-btn"
            >
              Create patient account
            </button>
          </p>
        </div>
      </div>

      {showForgotModal && (
        <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
      )}
    </div>
  );
}
