import React, { useState } from "react";
import { authApi } from "../api/auth";
import { KeyRound, X, CheckCircle, AlertCircle } from "lucide-react";

export function ForgotPasswordModal({ onClose }) {
  const [step, setStep] = useState(1); // 1: request, 2: reset
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleRequestToken = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      setMessage(res.message);
      if (res.data?.debug_reset_token) {
        setToken(res.data.debug_reset_token);
      }
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.resetPassword(token, newPassword);
      setMessage(res.message);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card animate-fade-in" style={{ padding: "1.75rem", maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)" }}>Reset password</h3>
            <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>Verify your account email to proceed</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
            id="close-reset-modal-btn"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-error" id="reset-modal-error" style={{ marginBottom: "1rem" }}>
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="alert alert-success" id="reset-modal-success" style={{ marginBottom: "1rem" }}>
            <CheckCircle size={16} /> <span>{message}</span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestToken}>
            <div className="form-group">
              <label className="form-label">Account email address</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                id="reset-email-input"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              id="send-reset-token-btn"
              style={{ marginTop: "0.75rem" }}
            >
              {loading ? "Sending..." : "Request reset token"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label className="form-label">Reset token</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Paste token or use debug token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                id="reset-token-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">New password</label>
              <input
                type="password"
                required
                minLength={6}
                className="form-input"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                id="reset-new-password-input"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              id="confirm-reset-password-btn"
              style={{ marginTop: "0.75rem" }}
            >
              {loading ? "Updating..." : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
