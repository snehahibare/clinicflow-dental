import React, { useState, useEffect } from "react";
import { appointmentApi } from "../api/appointments";
import {
  Calendar,
  Clock,
  User,
  AlertCircle,
  XCircle,
  AlertTriangle,
  X,
  Plus
} from "lucide-react";

export function MyAppointmentsPage({ onNavigate }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reschedule modal state
  const [reschedulingAppt, setReschedulingAppt] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [selectedNewSlot, setSelectedNewSlot] = useState("");
  const [reschedulingLoading, setReschedulingLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  // Cancel modal state
  const [cancellingAppt, setCancellingAppt] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellingLoading, setCancellingLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const data = await appointmentApi.getMyAppointments();
      setAppointments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (reschedulingAppt && rescheduleDate) {
      setRescheduleSlots([]);
      setSelectedNewSlot("");
      setRescheduleError(null);
      appointmentApi.getAvailableSlots(reschedulingAppt.doctor_id, rescheduleDate)
        .then((res) => {
          setRescheduleSlots(res.available_slots || []);
        })
        .catch((err) => {
          setRescheduleError(err.message);
        });
    }
  }, [reschedulingAppt, rescheduleDate]);

  const handleConfirmReschedule = async (e) => {
    e.preventDefault();
    if (!selectedNewSlot) {
      setRescheduleError("Please select an available slot.");
      return;
    }
    setReschedulingLoading(true);
    setRescheduleError(null);
    try {
      await appointmentApi.rescheduleAppointment(reschedulingAppt.id, {
        new_date: rescheduleDate,
        new_time_slot: selectedNewSlot,
      });
      setReschedulingAppt(null);
      fetchAppointments();
    } catch (err) {
      setRescheduleError(err.message);
    } finally {
      setReschedulingLoading(false);
    }
  };

  const handleConfirmCancel = async (e) => {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setCancelError("Please state a reason for cancellation.");
      return;
    }
    setCancellingLoading(true);
    setCancelError(null);
    try {
      await appointmentApi.cancelAppointment(cancellingAppt.id, {
        reason: cancellationReason.trim(),
      });
      setCancellingAppt(null);
      setCancellationReason("");
      fetchAppointments();
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancellingLoading(false);
    }
  };

  const isShortNotice = (appt) => {
    if (!appt || !appt.date || !appt.time_slot) return false;
    try {
      const startStr = appt.time_slot.split("-")[0].trim();
      const apptDt = new Date(`${appt.date}T${startStr}:00`);
      const now = new Date();
      const diffHours = (apptDt.getTime() - now.getTime()) / (1000 * 60 * 60);
      return diffHours >= 0 && diffHours < 2;
    } catch {
      return false;
    }
  };

  const upcomingAppts = appointments.filter(
    (a) => a.status === "booked" && a.date >= todayStr
  );
  const pastAppts = appointments.filter(
    (a) => a.status !== "booked" || a.date < todayStr
  );

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">My appointments</h1>
          <p className="page-header-subtext">
            Track your scheduled visits, reschedule dates, or cancel with reason
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => onNavigate("book")} id="new-booking-btn">
          <Plus size={15} /> Book new appointment
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-secondary)" }}>Loading your appointments...</p>
        </div>
      ) : appointments.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem", maxWidth: 580, margin: "0 auto" }}>
          <Calendar size={36} color="var(--accent)" style={{ opacity: 0.4, marginBottom: "1rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "0.5rem" }}>No appointments scheduled</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            You have no upcoming or past clinical visits booked.
          </p>
          <button className="btn btn-primary" onClick={() => onNavigate("book")}>
            Schedule an appointment now
          </button>
        </div>
      ) : (
        <div>
          {/* Upcoming Section */}
          <div style={{ marginBottom: "2.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 500, marginBottom: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} color="var(--accent)" /> Upcoming visits ({upcomingAppts.length})
            </h3>

            {upcomingAppts.length === 0 ? (
              <div className="card" style={{ padding: "1.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                No upcoming appointments scheduled.
              </div>
            ) : (
              <div className="grid-cards">
                {upcomingAppts.map((appt) => (
                  <div key={appt.id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <span className="badge badge-patient">{appt.specialization}</span>
                      <span className="status-indicator">
                        <span className="status-dot status-dot-accent" />
                        <span>Confirmed</span>
                      </span>
                    </div>

                    <h4 style={{ fontSize: "1.05rem", fontWeight: 500, marginBottom: "0.25rem" }}>{appt.doctor_name}</h4>
                    <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>Reason: {appt.reason}</p>

                    <div style={{ padding: "0.75rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 500 }}>
                        <Calendar size={14} color="var(--accent)" /> <span>{appt.date}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: 4 }}>
                        <Clock size={14} /> <span>{appt.time_slot}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
                        onClick={() => {
                          setReschedulingAppt(appt);
                          setRescheduleDate(appt.date);
                        }}
                        id={`reschedule-btn-${appt.id}`}
                      >
                        Reschedule
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.8rem", color: "var(--danger)", borderColor: "var(--border)" }}
                        onClick={() => setCancellingAppt(appt)}
                        id={`cancel-btn-${appt.id}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past & Cancelled Section */}
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 500, marginBottom: "1rem", color: "var(--text-secondary)" }}>
              Past and cancelled appointments ({pastAppts.length})
            </h3>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date and time</th>
                      <th>Practitioner</th>
                      <th>Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastAppts.map((appt) => (
                      <tr key={appt.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{appt.date}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{appt.time_slot}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{appt.doctor_name}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{appt.specialization}</div>
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{appt.reason}</td>
                        <td>
                          <span className="status-indicator">
                            <span className={`status-dot ${appt.status === "completed" ? "status-dot-success" : appt.status === "cancelled" ? "status-dot-danger" : "status-dot-neutral"}`} />
                            <span style={{ textTransform: "capitalize" }}>{appt.status}</span>
                          </span>
                          {appt.is_late_cancellation && (
                            <div style={{ fontSize: "0.7rem", color: "var(--warning)", marginTop: 2 }}>
                              Late cancellation (&lt;2h)
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingAppt && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 520, padding: "1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 500, fontFamily: "var(--font-serif)" }}>Reschedule appointment</h3>
                <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                  With {reschedulingAppt.doctor_name} ({reschedulingAppt.specialization})
                </p>
              </div>
              <button onClick={() => setReschedulingAppt(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {rescheduleError && (
              <div className="alert alert-error" id="reschedule-error-alert" style={{ marginBottom: "1rem" }}>
                <AlertCircle size={16} /> <span>{rescheduleError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmReschedule}>
              <div className="form-group">
                <label className="form-label">Select new date</label>
                <input
                  type="date"
                  min={todayStr}
                  required
                  className="form-input"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  id="reschedule-date-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Available slots for new date</label>
                {rescheduleSlots.length === 0 ? (
                  <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>No free slots found for this date. Choose another day.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "0.4rem", maxHeight: 180, overflowY: "auto" }}>
                    {rescheduleSlots.map((slot) => {
                      const isSel = selectedNewSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedNewSlot(slot)}
                          className={`btn ${isSel ? "btn-primary" : "btn-secondary"}`}
                          style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem", fontWeight: 500 }}
                          id={`resched-slot-${slot.replace(/\s+/g, "")}`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReschedulingAppt(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!selectedNewSlot || reschedulingLoading}
                  id="submit-reschedule-btn"
                >
                  {reschedulingLoading ? "Updating..." : "Confirm new slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingAppt && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 480, padding: "1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <XCircle size={20} color="var(--danger)" />
                <h3 style={{ fontSize: "1.2rem", fontWeight: 500, fontFamily: "var(--font-serif)" }}>Cancel appointment</h3>
              </div>
              <button onClick={() => setCancellingAppt(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {isShortNotice(cancellingAppt) && (
              <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
                <AlertTriangle size={16} />
                <span>
                  <strong>Short-notice warning:</strong> This visit is scheduled in under 2 hours.
                </span>
              </div>
            )}

            {cancelError && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                <AlertCircle size={16} /> <span>{cancelError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmCancel}>
              <div className="form-group">
                <label className="form-label">Reason for cancellation *</label>
                <textarea
                  rows={3}
                  required
                  className="form-textarea"
                  placeholder="Please state why you need to cancel..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  id="cancel-reason-input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCancellingAppt(null)}
                >
                  Keep appointment
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={cancellingLoading || !cancellationReason.trim()}
                  id="confirm-cancel-btn"
                >
                  {cancellingLoading ? "Cancelling..." : "Confirm cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
