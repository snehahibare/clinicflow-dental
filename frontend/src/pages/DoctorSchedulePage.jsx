import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { appointmentApi } from "../api/appointments";
import { TreatmentRecordModal } from "../components/TreatmentRecordModal";
import {
  Calendar,
  Clock,
  User,
  Phone,
  Stethoscope,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  FileText,
  CalendarDays,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

export function DoctorSchedulePage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Treatment modal state
  const [documentingAppt, setDocumentingAppt] = useState(null);
  const [cancellingAppt, setCancellingAppt] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, [selectedDate]);

  const fetchSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await appointmentApi.getDoctorSchedule(selectedDate);
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load doctor schedule:", err);
      setError(err.message || "Failed to load your daily schedule.");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSetToday = () => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  const handleSetTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleCancelAppointment = async (e) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      await appointmentApi.cancelAppointment(cancellingAppt.id, {
        cancellation_reason: cancelReason.trim(),
      });
      setNotification({
        type: "success",
        message: "Appointment cancelled successfully.",
      });
      setCancellingAppt(null);
      setCancelReason("");
      fetchSchedule();
    } catch (err) {
      setNotification({
        type: "error",
        message: err.message || "Failed to cancel appointment.",
      });
    } finally {
      setCancelling(false);
    }
  };

  const bookedCount = appointments.filter((a) => a.status === "booked").length;
  const completedCount = appointments.filter((a) => a.status === "completed").length;
  const cancelledCount = appointments.filter((a) => a.status === "cancelled").length;

  const formattedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="page-container animate-fade-in" id="doctor-schedule-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span className="badge badge-doctor">Doctor consultation hub</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>•</span>
              <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Logged in as <strong>{user?.name || "Doctor"}</strong>
              </span>
            </div>
            <h1 className="page-title" style={{ margin: 0 }}>Daily schedule & consultations</h1>
            <p className="page-subtitle" style={{ margin: "0.25rem 0 0 0" }}>
              Allocated patient appointments, consultation history, and clinical treatment documentation.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              onClick={handlePrevDay}
              title="Previous day"
              style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
            >
              ← Prev
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleSetToday}
              style={{
                padding: "0.45rem 0.75rem",
                fontSize: "0.85rem",
                fontWeight: selectedDate === new Date().toISOString().split("T")[0] ? 600 : 400,
                borderColor: selectedDate === new Date().toISOString().split("T")[0] ? "var(--accent)" : "var(--border)",
              }}
            >
              Today
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleSetTomorrow}
              style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
            >
              Tomorrow
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleNextDay}
              title="Next day"
              style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
            >
              Next →
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "0.5rem" }}>
              <input
                type="date"
                className="form-input"
                style={{ width: "auto", padding: "0.4rem 0.65rem", fontSize: "0.85rem" }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                id="doctor-schedule-date-input"
              />
              <button
                className="btn btn-secondary"
                onClick={fetchSchedule}
                title="Refresh schedule"
                style={{ padding: "0.45rem 0.65rem" }}
                id="doctor-refresh-schedule-btn"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "var(--radius-btn)",
            marginBottom: "1.25rem",
            background: notification.type === "error" ? "var(--danger-bg)" : "var(--success-bg)",
            color: notification.type === "error" ? "var(--danger)" : "var(--success)",
            border: `1px solid ${notification.type === "error" ? "var(--danger)" : "var(--success)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.875rem",
          }}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Strip */}
      <div className="stats-strip" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <span className="stat-label">Total for {selectedDate}</span>
          <div className="stat-value">{appointments.length}</div>
          <span className="stat-helper">{formattedDate}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending consultations</span>
          <div className="stat-value" style={{ color: "var(--accent)" }}>{bookedCount}</div>
          <span className="stat-helper">Ready for treatment</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed & billed</span>
          <div className="stat-value" style={{ color: "var(--success)" }}>{completedCount}</div>
          <span className="stat-helper">Records filed</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Cancelled / No show</span>
          <div className="stat-value" style={{ color: "var(--text-secondary)" }}>{cancelledCount}</div>
          <span className="stat-helper">Released slots</span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="card" style={{ border: "1px solid var(--danger)", background: "var(--danger-bg)", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <AlertCircle size={20} color="var(--danger)" />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 500, color: "var(--danger)" }}>Failed to load schedule</p>
              <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>{error}</p>
            </div>
            <button className="btn btn-secondary" onClick={fetchSchedule} style={{ fontSize: "0.8rem" }}>
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 1rem auto",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
            Loading your clinical schedule for {selectedDate}...
          </p>
        </div>
      ) : appointments.length === 0 ? (
        /* Empty State */
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "3.5rem 1.5rem",
            background: "var(--bg-section)",
            border: "1px dashed var(--border)",
          }}
          id="doctor-schedule-empty-state"
        >
          <CalendarDays size={42} color="var(--text-secondary)" style={{ marginBottom: "1rem", opacity: 0.6 }} />
          <h3 style={{ fontSize: "1.15rem", fontWeight: 500, fontFamily: "var(--font-serif)", marginBottom: "0.5rem" }}>
            No appointments scheduled for {formattedDate}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: 460, margin: "0 auto 1.5rem auto" }}>
            You have no patient consultations scheduled for this date. Check another day using the date picker above or review your weekly shift availability.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
            <button className="btn btn-secondary" onClick={handleSetToday} style={{ fontSize: "0.85rem" }}>
              Go to today
            </button>
            <button className="btn btn-secondary" onClick={handleSetTomorrow} style={{ fontSize: "0.85rem" }}>
              View tomorrow
            </button>
          </div>
        </div>
      ) : (
        /* Appointments List */
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }} id="doctor-appointments-list">
          {appointments.map((appt) => {
            const isBooked = appt.status === "booked";
            const isCompleted = appt.status === "completed";
            const isCancelled = appt.status === "cancelled";

            return (
              <div
                key={appt.id}
                className="card"
                style={{
                  padding: "1.25rem 1.5rem",
                  borderLeft: isBooked
                    ? "4px solid var(--accent)"
                    : isCompleted
                    ? "4px solid var(--success)"
                    : "4px solid var(--border)",
                  transition: "box-shadow 0.2s ease",
                }}
                id={`appointment-card-${appt.id}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                  {/* Left: Time & Patient Details */}
                  <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                    {/* Time Slot Badge */}
                    <div
                      style={{
                        padding: "0.6rem 0.85rem",
                        background: isBooked ? "var(--bg-section)" : "#FFFFFF",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-btn)",
                        textAlign: "center",
                        minWidth: 110,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", color: "var(--accent)", fontWeight: 600, fontSize: "0.95rem" }}>
                        <Clock size={14} />
                        <span>{appt.time_slot}</span>
                      </div>
                      <span style={{ fontSize: "0.725rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {appt.date}
                      </span>
                    </div>

                    {/* Patient Info */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.25rem" }}>
                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {appt.patient_name || "Patient"}
                        </h3>
                        {isBooked && (
                          <span className="badge badge-admin" style={{ fontSize: "0.75rem" }}>
                            Booked
                          </span>
                        )}
                        {isCompleted && (
                          <span className="badge badge-patient" style={{ background: "var(--success-bg)", color: "var(--success)", fontSize: "0.75rem" }}>
                            <CheckCircle size={12} style={{ marginRight: 3, verticalAlign: "middle" }} /> Completed
                          </span>
                        )}
                        {isCancelled && (
                          <span className="badge badge-patient" style={{ background: "var(--danger-bg)", color: "var(--danger)", fontSize: "0.75rem" }}>
                            <XCircle size={12} style={{ marginRight: 3, verticalAlign: "middle" }} /> Cancelled
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", color: "var(--text-secondary)", fontSize: "0.825rem", marginBottom: "0.5rem" }}>
                        {appt.patient_phone && (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <Phone size={13} /> {appt.patient_phone}
                          </span>
                        )}
                        <span>•</span>
                        <span>Booking ID: <code style={{ fontSize: "0.78rem" }}>{appt.id.slice(0, 8)}</code></span>
                        <span>•</span>
                        <span>Source: {appt.created_via}</span>
                      </div>

                      {/* Reason */}
                      <div style={{ background: "var(--bg-section)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-btn)", fontSize: "0.85rem", color: "var(--text-primary)", display: "inline-block" }}>
                        <span style={{ fontWeight: 500, color: "var(--accent)" }}>Reason: </span>
                        {appt.reason || "General Consultation"}
                      </div>

                      {/* Cancellation reason if cancelled */}
                      {isCancelled && appt.cancellation_reason && (
                        <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.8rem", color: "var(--danger)" }}>
                          <strong>Cancellation reason:</strong> {appt.cancellation_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Doctor Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
                    {isBooked && (
                      <>
                        <button
                          className="btn btn-primary"
                          style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                          onClick={() => setDocumentingAppt(appt)}
                          id={`btn-document-treatment-${appt.id}`}
                        >
                          <Stethoscope size={16} />
                          <span>Document treatment</span>
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem", color: "var(--danger)", borderColor: "var(--border)" }}
                          onClick={() => setCancellingAppt(appt)}
                          id={`btn-cancel-appt-${appt.id}`}
                        >
                          Cancel appointment
                        </button>
                      </>
                    )}

                    {isCompleted && (
                      <div style={{ textAlign: "right" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.825rem", color: "var(--success)", fontWeight: 500 }}>
                          <CheckCircle2 size={16} /> Treatment recorded
                        </span>
                        <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          Invoice posted to Billing ledger
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Treatment Documentation Modal */}
      {documentingAppt && (
        <TreatmentRecordModal
          appointment={documentingAppt}
          onClose={() => setDocumentingAppt(null)}
          onSuccess={(record) => {
            setNotification({
              type: "success",
              message: `Treatment documented successfully for ${documentingAppt.patient_name || "patient"}. Invoice posted to clinic ledger.`,
            });
            setDocumentingAppt(null);
            fetchSchedule();
          }}
        />
      )}

      {/* Cancellation Modal */}
      {cancellingAppt && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 450 }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 500, fontFamily: "var(--font-serif)", marginBottom: "0.5rem" }}>
              Cancel appointment
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Cancel consultation for <strong>{cancellingAppt.patient_name}</strong> at {cancellingAppt.time_slot}.
            </p>
            <form onSubmit={handleCancelAppointment}>
              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label className="form-label">Cancellation reason *</label>
                <textarea
                  className="form-input"
                  rows={3}
                  required
                  placeholder="Doctor emergency, patient unavailable, rescheduled..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  id="cancel-reason-textarea"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCancellingAppt(null);
                    setCancelReason("");
                  }}
                >
                  Keep appointment
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                  disabled={cancelling || !cancelReason.trim()}
                  id="confirm-cancel-btn"
                >
                  {cancelling ? "Cancelling..." : "Confirm cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
