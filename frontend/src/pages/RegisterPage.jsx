import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { UserPlus, AlertCircle } from "lucide-react";

export function RegisterPage({ onNavigate }) {
  const { registerPatient } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    dob: "",
    gender: "male",
    address: "",
    emergency_contact: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...formData,
        dob: formData.dob ? formData.dob : null,
      };
      await registerPatient(payload);
      onNavigate("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="card auth-card animate-fade-in" style={{ maxWidth: 540, margin: "2.5rem auto", padding: "2.25rem 2rem" }}>
        <div className="auth-header" style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.2rem", fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
            DCMS
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Create your personal dental patient account
          </p>
        </div>

        {error && (
          <div className="alert alert-error" id="register-error-alert" style={{ marginBottom: "1.25rem" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full name *</label>
            <input
              type="text"
              name="name"
              required
              className="form-input"
              placeholder="Jane Doe"
              value={formData.name}
              onChange={handleChange}
              id="register-name-input"
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Email address *</label>
              <input
                type="email"
                name="email"
                required
                className="form-input"
                placeholder="patient@example.com"
                value={formData.email}
                onChange={handleChange}
                id="register-email-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone number *</label>
              <input
                type="tel"
                name="phone"
                required
                className="form-input"
                placeholder="+15551234567"
                value={formData.phone}
                onChange={handleChange}
                id="register-phone-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password * (min 8 characters)</label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              className="form-input"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              id="register-password-input"
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Date of birth</label>
              <input
                type="date"
                name="dob"
                className="form-input"
                value={formData.dob}
                onChange={handleChange}
                id="register-dob-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gender</label>
              <select
                name="gender"
                className="form-select"
                value={formData.gender}
                onChange={handleChange}
                id="register-gender-select"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Residential address</label>
            <input
              type="text"
              name="address"
              className="form-input"
              placeholder="Street, City, Zip code"
              value={formData.address}
              onChange={handleChange}
              id="register-address-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Emergency contact (name & phone)</label>
            <input
              type="text"
              name="emergency_contact"
              className="form-input"
              placeholder="e.g. Spouse (+15559876543)"
              value={formData.emergency_contact}
              onChange={handleChange}
              id="register-emergency-input"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            id="register-submit-btn"
            style={{ marginTop: "1rem" }}
          >
            <UserPlus size={16} />
            {loading ? "Registering account..." : "Complete registration"}
          </button>
        </form>

        <div style={{ marginTop: "1.75rem", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <button
              type="button"
              style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => onNavigate("login")}
              id="goto-login-btn"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
