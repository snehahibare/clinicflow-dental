import React, { useState } from "react";
import { doctorApi } from "../../api/doctors";
import { Stethoscope, X, Plus, Trash2, CheckCircle, AlertCircle, Clock } from "lucide-react";

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SPECIALIZATIONS = [
  "General Dentist",
  "Orthodontist",
  "Endodontist",
  "Pediatric Dentist",
  "Periodontist",
  "Oral Surgeon",
];

export function DoctorEditModal({ doctor, onClose, onUpdated }) {
  const [specialization, setSpecialization] = useState(doctor.specialization || "General Dentist");
  const [status, setStatus] = useState(doctor.status || "active");
  const [availableDays, setAvailableDays] = useState(doctor.available_days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [availableSlots, setAvailableSlots] = useState(() => {
    const initial = {};
    ALL_DAYS.forEach((day) => {
      initial[day] = doctor.available_slots?.[day] || [
        { start: "09:00", end: "13:00" },
        { start: "14:00", end: "17:00" },
      ];
    });
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const toggleDay = (day) => {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter((d) => d !== day));
    } else {
      setAvailableDays([...availableDays, day]);
    }
  };

  const handleSlotChange = (day, index, field, value) => {
    const daySlots = [...(availableSlots[day] || [])];
    daySlots[index] = { ...daySlots[index], [field]: value };
    setAvailableSlots({ ...availableSlots, [day]: daySlots });
  };

  const addSlot = (day) => {
    const daySlots = [...(availableSlots[day] || [])];
    daySlots.push({ start: "09:00", end: "12:00" });
    setAvailableSlots({ ...availableSlots, [day]: daySlots });
  };

  const removeSlot = (day, index) => {
    const daySlots = availableSlots[day].filter((_, i) => i !== index);
    setAvailableSlots({ ...availableSlots, [day]: daySlots });
  };

  const validateSlots = () => {
    for (const day of availableDays) {
      const slots = availableSlots[day] || [];
      for (const slot of slots) {
        if (!slot.start || !slot.end) {
          return `Please fill both start and end time for ${day}.`;
        }
        if (slot.end <= slot.start) {
          return `End time (${slot.end}) must be strictly after start time (${slot.start}) on ${day}.`;
        }
      }
      const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].end > sorted[i + 1].start) {
          return `Overlapping time intervals detected on ${day}: ${sorted[i].start}-${sorted[i].end} and ${sorted[i + 1].start}-${sorted[i + 1].end}.`;
        }
      }
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateSlots();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const filteredSlots = {};
      availableDays.forEach((day) => {
        filteredSlots[day] = availableSlots[day] || [];
      });

      const updated = await doctorApi.updateDoctorProfile(doctor.id, {
        specialization,
        status,
        available_days: availableDays,
        available_slots: filteredSlots,
      });

      setSuccess("Practitioner profile and schedule updated successfully.");
      if (onUpdated) onUpdated(updated);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card animate-fade-in" style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)" }}>Edit practitioner schedule</h3>
            <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>{doctor.name} ({doctor.email})</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
            id="close-doctor-edit-modal-btn"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-error" id="doctor-edit-error" style={{ marginBottom: "1rem" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success" id="doctor-edit-success" style={{ marginBottom: "1rem" }}>
            <CheckCircle size={16} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Specialization</label>
              <select
                className="form-select"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                id="edit-doc-specialization-select"
              >
                {SPECIALIZATIONS.map((spec) => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Practice status</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                id="edit-doc-status-select"
              >
                <option value="active">Active (accepting appointments)</option>
                <option value="inactive">Inactive (unavailable)</option>
              </select>
            </div>
          </div>

          {/* Weekly Available Days */}
          <div className="form-group">
            <label className="form-label">Weekly working days</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {ALL_DAYS.map((day) => {
                const isSelected = availableDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`btn ${isSelected ? "btn-primary" : "btn-secondary"}`}
                    style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                  >
                    {day.substring(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Slots Configurator */}
          <div className="form-group">
            <label className="form-label">Daily shift time slots</label>
            <div style={{ maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
              {availableDays.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Select at least one day above to configure shifts.</p>
              ) : (
                availableDays.map((day) => (
                  <div
                    key={day}
                    style={{
                      background: "var(--bg-section)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-btn)",
                      padding: "0.75rem",
                      marginBottom: "0.6rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)" }}>{day}</span>
                      <button
                        type="button"
                        onClick={() => addSlot(day)}
                        className="btn btn-secondary"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      >
                        <Plus size={12} /> Add interval
                      </button>
                    </div>

                    {(availableSlots[day] || []).map((slot, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                        <Clock size={13} color="var(--text-secondary)" />
                        <input
                          type="time"
                          required
                          className="form-input"
                          style={{ padding: "0.3rem 0.5rem", fontSize: "0.825rem", width: "115px" }}
                          value={slot.start}
                          onChange={(e) => handleSlotChange(day, idx, "start", e.target.value)}
                        />
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>to</span>
                        <input
                          type="time"
                          required
                          className="form-input"
                          style={{ padding: "0.3rem 0.5rem", fontSize: "0.825rem", width: "115px" }}
                          value={slot.end}
                          onChange={(e) => handleSlotChange(day, idx, "end", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeSlot(day, idx)}
                          style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0.25rem" }}
                          title="Remove interval"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            id="save-doctor-schedule-btn"
            style={{ marginTop: "1rem" }}
          >
            {loading ? "Saving schedule..." : "Save practitioner schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}
