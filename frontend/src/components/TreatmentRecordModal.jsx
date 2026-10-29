import React, { useState } from "react";
import { treatmentApi } from "../api/treatments";
import {
  FileText,
  DollarSign,
  Calendar,
  AlertCircle,
  X,
  Stethoscope,
  Pill
} from "lucide-react";

export function TreatmentRecordModal({ appointment, onClose, onSuccess }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [procedure, setProcedure] = useState("");
  const [prescription, setPrescription] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [billAmount, setBillAmount] = useState("100.00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!diagnosis.trim() || !procedure.trim() || !prescription.trim()) {
      setError("Please fill in diagnosis, procedure, and prescription.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        diagnosis: diagnosis.trim(),
        procedure: procedure.trim(),
        prescription: prescription.trim(),
        follow_up_date: followUpDate || null,
        bill_amount: parseFloat(billAmount) || 0.0,
      };

      const result = await treatmentApi.createTreatmentRecord(appointment.id, payload);
      if (onSuccess) onSuccess(result);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to record treatment details.");
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="modal-overlay">
      <div className="modal-card animate-fade-in" style={{ maxWidth: 600, maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)", margin: 0 }}>
              Clinical treatment record
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", margin: "0.25rem 0 0 0" }}>
              Document clinical findings, post-op prescription, follow-up, and invoice amount.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Patient & Appointment Context Badge */}
        <div style={{
          padding: "0.85rem 1rem",
          background: "var(--bg-section)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          marginBottom: "1.25rem",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.5rem",
          fontSize: "0.85rem"
        }}>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Patient:</span>{" "}
            <strong>{appointment.patient_name}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Phone:</span>{" "}
            <span>{appointment.patient_phone}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Appointment:</span>{" "}
            <span>{appointment.date} at {appointment.time_slot}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Chief complaint:</span>{" "}
            <span>{appointment.reason}</span>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1.25rem" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Diagnosis */}
          <div className="form-group">
            <label className="form-label">
              Clinical diagnosis / findings *
            </label>
            <textarea
              rows={2}
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="e.g. Deep occlusal dentinal caries with mild pulpal irritation"
              className="form-textarea"
              id="treatment-diagnosis-input"
              required
            />
          </div>

          {/* Procedure Performed */}
          <div className="form-group">
            <label className="form-label">
              Procedure and treatment performed *
            </label>
            <textarea
              rows={2}
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              placeholder="e.g. Excavation of decay, composite resin restoration"
              className="form-textarea"
              id="treatment-procedure-input"
              required
            />
          </div>

          {/* Prescription & Post-Op */}
          <div className="form-group">
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Pill size={14} color="var(--accent)" /> Digital prescription and post-op instructions *
            </label>
            <textarea
              rows={2}
              value={prescription}
              onChange={(e) => setPrescription(e.target.value)}
              placeholder="e.g. Ibuprofen 400mg every 6h as needed. Avoid hard foods for 24h."
              className="form-textarea"
              id="treatment-prescription-input"
              required
            />
          </div>

          {/* Follow-up & Bill Row */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Calendar size={14} color="var(--accent)" /> Recommended follow-up date
              </label>
              <input
                type="date"
                min={todayStr}
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="form-input"
                id="treatment-followup-input"
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Optional</span>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)" }}>₹</span> Treatment bill amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder="0.00"
                className="form-input"
                id="treatment-bill-input"
                required
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Generates pending invoice</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              id="treatment-submit-btn"
            >
              {loading ? "Saving record..." : "Save record and complete appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
