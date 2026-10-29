import React, { useState, useEffect } from "react";
import { patientApi } from "../api/patients";
import { CreditCard, AlertCircle } from "lucide-react";

export function PatientBillsPage() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const data = await patientApi.getMyBills();
      setBills(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalBilled = bills.reduce((acc, b) => acc + b.amount, 0);
  const pendingDues = bills
    .filter((b) => b.status === "pending" || b.status === "partial")
    .reduce((acc, b) => acc + b.amount, 0);

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">My invoices and bills</h1>
          <p className="page-header-subtext">
            Review treatment statements, outstanding balances, and payment status
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {/* Slim Horizontal Secondary Stats Strip (Hairline Dividers, NOT Cards) */}
      <div className="stats-strip">
        <div className="stats-strip-item">
          <span className="stats-strip-value">₹{totalBilled.toFixed(2)}</span>
          <span className="stats-strip-label">Total invoiced</span>
        </div>
        <div className="stats-strip-divider" />
        <div className="stats-strip-item">
          <span className="stats-strip-value">₹{pendingDues.toFixed(2)}</span>
          <span className="stats-strip-label">Outstanding dues</span>
        </div>
        <div className="stats-strip-divider" />
        <div className="stats-strip-item">
          <span className="stats-strip-value">{pendingDues === 0 ? "Settled" : "Dues pending"}</span>
          <span className="stats-strip-label">Account status</span>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-secondary)" }}>Loading invoices...</p>
        </div>
      ) : bills.length === 0 ? (
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
            <CreditCard size={26} color="var(--accent)" />
          </div>

          <h2 style={{ fontSize: "1.35rem", fontWeight: 500, marginBottom: "0.5rem" }}>No invoices generated yet</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: 440, margin: "0 auto 1.5rem auto", lineHeight: 1.6 }}>
            You have no outstanding fees or past statements. Itemized clinic bills are generated automatically after completed visits.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Attending practitioner</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment date</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.date}</td>
                    <td style={{ fontWeight: 500 }}>Dr. {b.doctor_name}</td>
                    <td style={{ fontWeight: 600 }}>₹{b.amount.toFixed(2)}</td>
                    <td>
                      <span className="status-indicator">
                        <span className={`status-dot ${b.status === "paid" ? "status-dot-success" : "status-dot-warning"}`} />
                        <span>{b.status === "paid" ? "Paid" : "Pending"}</span>
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {b.payment_date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
