import React, { useState, useEffect } from "react";
import { billingApi } from "../api/billing";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  Calendar,
  DollarSign
} from "lucide-react";

export function AdminBillingPage() {
  const [overview, setOverview] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Status update modal state
  const [editingBill, setEditingBill] = useState(null);
  const [newStatus, setNewStatus] = useState("paid");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [updating, setUpdating] = useState(false);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    fetchBilling();
  }, [statusFilter]);

  const fetchBilling = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingApi.getBillingOverview(statusFilter);
      setOverview(data);
    } catch (err) {
      setError(err.message || "Failed to load billing ledger.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenUpdateModal = (bill) => {
    setEditingBill(bill);
    setNewStatus(bill.status === "pending" ? "paid" : bill.status);
    setPaymentDate(bill.payment_date || new Date().toISOString().split("T")[0]);
    setModalError(null);
  };

  const handleSaveStatus = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setModalError(null);
    try {
      await billingApi.updateBillStatus(editingBill.id, {
        status: newStatus,
        payment_date: newStatus === "pending" ? null : paymentDate,
      });

      setNotification({
        type: "success",
        message: `Invoice #${editingBill.id.slice(0, 8)} status updated to ${newStatus}`,
      });
      setEditingBill(null);
      fetchBilling();
    } catch (err) {
      setModalError(err.message || "Failed to update bill status.");
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "paid":
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-success" />
            <span>Paid</span>
          </span>
        );
      case "partial":
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-warning" />
            <span>Partial</span>
          </span>
        );
      default:
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-warning" />
            <span>Pending</span>
          </span>
        );
    }
  };

  const bills = overview?.bills || [];

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">Clinic billing ledger</h1>
          <p className="page-header-subtext">
            Clinic-wide receivables overview, monthly revenue, and patient invoice settlement
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={fetchBilling}
          id="billing-refresh-btn"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {notification && (
        <div style={{
          padding: "0.85rem 1.25rem",
          borderRadius: "var(--radius-btn)",
          marginBottom: "1.5rem",
          background: "var(--success-bg)",
          border: "1px solid var(--success)",
          color: "var(--accent)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.2rem" }}>&times;</button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {/* Slim Horizontal Secondary Stats Strip (Hairline Dividers, NOT Cards) */}
      <div className="stats-strip">
        <div className="stats-strip-item">
          <span className="stats-strip-value">
            ₹{overview ? Number(overview.total_outstanding).toFixed(2) : "0.00"}
          </span>
          <span className="stats-strip-label">Total outstanding dues</span>
        </div>
        <div className="stats-strip-divider" />
        <div className="stats-strip-item">
          <span className="stats-strip-value">
            ₹{overview ? Number(overview.total_collected_this_month).toFixed(2) : "0.00"}
          </span>
          <span className="stats-strip-label">Collected this month</span>
        </div>
        <div className="stats-strip-divider" />
        <div className="stats-strip-item">
          <span className="stats-strip-value">
            {overview ? overview.total_bills_count : 0}
          </span>
          <span className="stats-strip-label">Total clinic invoices</span>
        </div>
      </div>

      {/* Filter Tabs & Invoices Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Status Filter Tabs */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {[
              { id: "all", label: "All invoices" },
              { id: "pending", label: "Pending" },
              { id: "paid", label: "Paid in full" },
              { id: "partial", label: "Partial" },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`btn ${statusFilter === tab.id ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.825rem" }}
                onClick={() => setStatusFilter(tab.id)}
                id={`filter-${tab.id}-btn`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
            Showing {bills.length} invoice{bills.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem 0" }}>
            <p style={{ color: "var(--text-secondary)" }}>Loading invoices...</p>
          </div>
        ) : bills.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3.5rem 1rem", color: "var(--text-secondary)" }}>
            <CreditCard size={36} style={{ opacity: 0.3, marginBottom: "0.75rem" }} />
            <h4 style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: "0.25rem" }}>No invoices found</h4>
            <p style={{ fontSize: "0.85rem" }}>No billing records match the selected filter.</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Patient</th>
                  <th>Practitioner</th>
                  <th>Procedure / notes</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment date</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        #{b.id.slice(0, 8)}
                      </span>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{b.created_at ? b.created_at.split("T")[0] : b.date}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{b.patient_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{b.patient_phone}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>Dr. {b.doctor_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{b.doctor_specialization}</div>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ fontSize: "0.85rem" }}>{b.procedure_notes || "Clinical consultation"}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Visit: {b.appointment_date}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>₹{Number(b.amount).toFixed(2)}</span>
                    </td>
                    <td>
                      {getStatusBadge(b.status)}
                    </td>
                    <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {b.payment_date || "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                        onClick={() => handleOpenUpdateModal(b)}
                        id={`update-bill-btn-${b.id}`}
                      >
                        Update status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* UPDATE STATUS MODAL */}
      {editingBill && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 460, padding: "1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)", margin: 0 }}>
                  Update invoice status
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", margin: 0 }}>
                  Invoice #{editingBill.id.slice(0, 8)} • ₹{Number(editingBill.amount).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setEditingBill(null)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Bill Info recap */}
            <div style={{ padding: "0.75rem 1rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", marginBottom: "1.25rem", fontSize: "0.825rem" }}>
              <div>Patient: <strong>{editingBill.patient_name}</strong></div>
              <div>Procedure: {editingBill.procedure_notes}</div>
              <div>Total amount: <strong>₹{Number(editingBill.amount).toFixed(2)}</strong></div>
            </div>

            {modalError && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveStatus}>
              <div className="form-group">
                <label className="form-label">Payment status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="form-select"
                  id="bill-status-select"
                >
                  <option value="paid">Paid in full (settled)</option>
                  <option value="partial">Partial payment received</option>
                  <option value="pending">Pending (unpaid)</option>
                </select>
              </div>

              {newStatus !== "pending" && (
                <div className="form-group">
                  <label className="form-label">Settlement / payment date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="form-input"
                    id="bill-payment-date-input"
                    required
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingBill(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updating}
                  id="save-bill-status-btn"
                >
                  {updating ? "Saving..." : "Update invoice status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
