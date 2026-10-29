import React, { useState, useEffect } from "react";
import { patientApi } from "../api/patients";
import { FileText, AlertCircle, Sparkles } from "lucide-react";

export function PatientRecordsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await patientApi.getMyRecords();
      setRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">Treatment records and prescriptions</h1>
          <p className="page-header-subtext">
            Review diagnostic findings, completed clinical procedures, and digital prescriptions
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-secondary)" }}>Loading clinical records...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem", maxWidth: 640, margin: "0 auto" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--bg-section)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem auto",
              border: "1px solid var(--border)"
            }}
          >
            <FileText size={26} color="var(--accent)" />
          </div>

          <h2 style={{ fontSize: "1.35rem", fontWeight: 500, marginBottom: "0.5rem" }}>No treatment records yet</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: 440, margin: "0 auto 1.5rem auto", lineHeight: 1.6 }}>
            Your dental treatment history is clear. When you complete an appointment, your doctor's diagnostic notes, procedures, and prescriptions will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid-cards">
          {records.map((rec) => (
            <div key={rec.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span className="badge badge-doctor">{rec.specialization}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{rec.date}</span>
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 500, marginBottom: "0.25rem" }}>Dr. {rec.doctor_name}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", marginBottom: "1rem" }}>Reason: {rec.reason}</p>

              {rec.diagnosis && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text-secondary)" }}>Diagnosis</span>
                  <p style={{ fontSize: "0.875rem", marginTop: 2 }}>{rec.diagnosis}</p>
                </div>
              )}

              {rec.procedure && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text-secondary)" }}>Procedure performed</span>
                  <p style={{ fontSize: "0.875rem", marginTop: 2 }}>{rec.procedure}</p>
                </div>
              )}

              {rec.prescription && (
                <div style={{ padding: "0.75rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--accent)" }}>Digital prescription</span>
                  <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>{rec.prescription}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
