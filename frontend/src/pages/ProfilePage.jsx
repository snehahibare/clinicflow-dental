import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/auth";
import { patientApi } from "../api/patients";
import { User, Lock, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";

export function ProfilePage() {
  const { user, role, refreshUserProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");

  // Extended Patient Clinical Profile
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("male");
  const [address, setAddress] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState(null);
  const [pwError, setPwError] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    if (role === "patient") {
      patientApi.getMyProfile()
        .then((data) => {
          if (data.dob) setDob(data.dob);
          if (data.gender) setGender(data.gender);
          if (data.address) setAddress(data.address);
          if (data.allergies) setAllergies(data.allergies);
          if (data.emergency_contact) setEmergencyContact(data.emergency_contact);
        })
        .catch((err) => console.warn("Could not fetch patient medical profile:", err));
    }
  }, [role]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileLoading(true);
    try {
      if (role === "patient") {
        await patientApi.updateMyProfile({
          name,
          phone,
          dob: dob || null,
          gender,
          address,
          allergies,
          emergency_contact: emergencyContact,
        });
      } else {
        await authApi.updateMe({ name, phone });
      }
      await refreshUserProfile();
      setProfileSuccess("Medical and contact profile updated successfully.");
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }

    setPwLoading(true);
    try {
      const res = await authApi.changePassword(currentPassword, newPassword);
      setPwSuccess(res.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const getRoleBadge = (r) => {
    switch (r) {
      case "admin":
        return <span className="badge badge-admin">Admin</span>;
      case "doctor":
        return <span className="badge badge-doctor">Doctor</span>;
      default:
        return <span className="badge badge-patient">Patient</span>;
    }
  };

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">Profile and settings</h1>
          <p className="page-header-subtext">
            Manage your personal contact details, medical history disclosures, and security credentials
          </p>
        </div>
      </div>

      <div className="grid-cards">
        {/* Profile Card */}
        <div className="card" style={{ gridColumn: role === "patient" ? "span 2" : "span 1" }}>
          <h3 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <User size={18} color="var(--accent)" />
            {role === "patient" ? "Patient medical and personal profile" : "Personal details"}
          </h3>

          {profileError && (
            <div className="alert alert-error" id="profile-error-alert" style={{ marginBottom: "1rem" }}>
              <AlertCircle size={16} /> <span>{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="alert alert-success" id="profile-success-alert" style={{ marginBottom: "1rem" }}>
              <CheckCircle size={16} /> <span>{profileSuccess}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Email address (immutable)</label>
                <input
                  type="email"
                  disabled
                  className="form-input"
                  value={user?.email || ""}
                  style={{ opacity: 0.7, cursor: "not-allowed", backgroundColor: "var(--bg-section)" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  id="profile-name-input"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Primary contact phone</label>
                <input
                  type="tel"
                  required
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  id="profile-phone-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Assigned role</label>
                <div style={{ paddingTop: 4 }}>
                  {getRoleBadge(user?.role)}
                </div>
              </div>
            </div>

            {/* Extended Medical Fields for Patient */}
            {role === "patient" && (
              <>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Date of birth</label>
                    <input
                      type="date"
                      className="form-input"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      id="profile-dob-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Gender</label>
                    <select
                      className="form-select"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      id="profile-gender-select"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Residential address</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 123 Dental Way, Suite 4B"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      id="profile-address-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Emergency contact phone</label>
                    <input
                      type="tel"
                      className="form-input"
                      placeholder="e.g. +15559990000"
                      value={emergencyContact}
                      onChange={(e) => setEmergencyContact(e.target.value)}
                      id="profile-emergency-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                    <AlertTriangle size={15} color="var(--warning)" />
                    <label className="form-label" style={{ marginBottom: 0, color: "var(--warning)" }}>
                      Known allergies and medical warnings
                    </label>
                  </div>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Disclose any known drug or latex allergies..."
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    id="profile-allergies-input"
                    style={{ borderColor: allergies ? "var(--warning)" : "var(--border)" }}
                  />
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                    Critical for your attending dental practitioner before procedures or prescribing medication.
                  </p>
                </div>
              </>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={profileLoading}
              id="update-profile-btn"
              style={{ marginTop: "0.5rem" }}
            >
              {profileLoading ? "Saving..." : "Save profile details"}
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="card">
          <h3 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Lock size={18} color="var(--accent)" />
            Change password
          </h3>

          {pwError && (
            <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
              <AlertCircle size={16} /> <span>{pwError}</span>
            </div>
          )}

          {pwSuccess && (
            <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
              <CheckCircle size={16} /> <span>{pwSuccess}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current password</label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                id="change-pw-current-input"
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
                id="change-pw-new-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm new password</label>
              <input
                type="password"
                required
                minLength={6}
                className="form-input"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                id="change-pw-confirm-input"
              />
            </div>

            <button
              type="submit"
              className="btn btn-secondary"
              disabled={pwLoading}
              id="change-pw-submit-btn"
            >
              {pwLoading ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
