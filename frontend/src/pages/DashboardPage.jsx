import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/auth";
import { doctorApi } from "../api/doctors";
import { patientApi } from "../api/patients";
import { treatmentApi } from "../api/treatments";
import { appointmentApi } from "../api/appointments";
import { billingApi } from "../api/billing";
import { notificationsApi } from "../api/notifications";
import { DoctorEditModal } from "../components/doctor/DoctorEditModal";
import {
  Users,
  Calendar,
  FileText,
  CreditCard,
  Bot,
  UserPlus,
  Stethoscope,
  Clock,
  Search,
  ArrowRight,
  Sparkles,
  CalendarCheck,
  ShieldAlert,
  BellOff,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone
} from "lucide-react";

export function DashboardPage({ onNavigate }) {
  const { user, role } = useAuth();
  const [doctorsList, setDoctorsList] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);

  // Admin Live Header & Strip Metrics
  const [todayAppointmentsCount, setTodayAppointmentsCount] = useState(0);
  const [outstandingBillsTotal, setOutstandingBillsTotal] = useState(0);

  // Admin Reassignments & Failed Notifications State
  const [reassignmentsNeeded, setReassignmentsNeeded] = useState([]);
  const [failedNotifications, setFailedNotifications] = useState([]);
  const [retryingNotificationId, setRetryingNotificationId] = useState(null);
  const [dispatchingReminders, setDispatchingReminders] = useState(false);
  const [dashboardNotification, setDashboardNotification] = useState(null);

  // Reassignment Modal State on Dashboard
  const [reassignAppt, setReassignAppt] = useState(null);
  const [reassignDoctorId, setReassignDoctorId] = useState("");
  const [reassignDate, setReassignDate] = useState("");
  const [reassignSlots, setReassignSlots] = useState([]);
  const [reassignSelectedSlot, setReassignSelectedSlot] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState(null);

  // Doctor's Own Schedule & Follow-ups State
  const [mySchedule, setMySchedule] = useState(null);
  const [followUps, setFollowUps] = useState([]);

  // Patient live metrics
  const [patientStats, setPatientStats] = useState({ upcomingCount: 0, unpaidBills: 0 });

  // Admin Search Patient Quick State
  const [quickPatientQuery, setQuickPatientQuery] = useState("");
  const [quickPatients, setQuickPatients] = useState([]);

  // Admin Add Staff State
  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "doctor",
    specialization: "General Dentist",
  });
  const [staffSuccess, setStaffSuccess] = useState(null);
  const [staffError, setStaffError] = useState(null);
  const [submittingStaff, setSubmittingStaff] = useState(false);

  useEffect(() => {
    if (role === "admin") {
      fetchDoctors();
      fetchAdminLiveMetrics();
    } else if (role === "doctor") {
      fetchDoctorSchedule();
      fetchDoctorFollowUps();
    } else if (role === "patient") {
      fetchPatientStats();
    }
  }, [role]);

  const fetchAdminLiveMetrics = async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    try {
      const [scheduleData, billingData, reassignData, failedNotifsData] = await Promise.all([
        appointmentApi.getAdminSchedule(todayStr).catch(() => []),
        billingApi.getBillingOverview().catch(() => ({ total_outstanding: 0 })),
        appointmentApi.getReassignmentsNeeded().catch(() => []),
        notificationsApi.getFailedNotifications().catch(() => [])
      ]);
      const activeAppts = Array.isArray(scheduleData)
        ? scheduleData.filter((a) => a.status === "booked").length
        : 0;
      setTodayAppointmentsCount(activeAppts);
      setOutstandingBillsTotal(billingData.total_outstanding || 0);
      setReassignmentsNeeded(reassignData || []);
      setFailedNotifications(failedNotifsData || []);
    } catch (err) {
      console.warn("Could not load admin live metrics:", err);
    }
  };

  // Load slots for reassignment target doctor & date on Dashboard
  useEffect(() => {
    if (reassignDoctorId && reassignDate) {
      setReassignSlots([]);
      setReassignSelectedSlot("");
      appointmentApi.getAvailableSlots(reassignDoctorId, reassignDate)
        .then((res) => setReassignSlots(res.available_slots || []))
        .catch(() => setReassignSlots([]));
    }
  }, [reassignDoctorId, reassignDate]);

  const openReassignModal = (appt) => {
    setReassignAppt(appt);
    setReassignDoctorId("");
    setReassignDate(appt.date);
    setReassignSlots([]);
    setReassignSelectedSlot("");
    setReassignError(null);
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!reassignDoctorId || !reassignDate || !reassignSelectedSlot) {
      setReassignError("Please select a target doctor, date, and available slot.");
      return;
    }

    setReassignSubmitting(true);
    setReassignError(null);
    try {
      await appointmentApi.adminReassignAppointment(reassignAppt.id, {
        new_doctor_id: reassignDoctorId,
        new_date: reassignDate,
        new_time_slot: reassignSelectedSlot,
      });

      setDashboardNotification({
        type: "success",
        message: `Appointment successfully reassigned to Dr. ${doctorsList.find((d) => d.id === reassignDoctorId)?.name || "Doctor"} for ${reassignDate} at ${reassignSelectedSlot}.`,
      });
      setReassignAppt(null);
      fetchAdminLiveMetrics();
    } catch (err) {
      setReassignError(err.message || "Failed to reassign appointment.");
    } finally {
      setReassignSubmitting(false);
    }
  };

  const handleRetryNotification = async (notifId) => {
    setRetryingNotificationId(notifId);
    try {
      const res = await notificationsApi.retryNotification(notifId);
      setDashboardNotification({
        type: res.status === "SENT" ? "success" : "error",
        message: res.status === "SENT" 
          ? `Notification #${notifId.slice(0, 8)} successfully redelivered!`
          : `Retry completed with status ${res.status}: ${res.failure_reason || "Check provider credentials"}`,
      });
      const updatedFailed = await notificationsApi.getFailedNotifications();
      setFailedNotifications(updatedFailed);
    } catch (err) {
      setDashboardNotification({
        type: "error",
        message: `Retry failed: ${err.message}`,
      });
    } finally {
      setRetryingNotificationId(null);
    }
  };

  const handleDispatchReminders = async () => {
    setDispatchingReminders(true);
    try {
      const res = await notificationsApi.trigger24hReminders();
      setDashboardNotification({
        type: "success",
        message: `Automated reminder check completed: ${res.reminders_dispatched} reminder(s) dispatched for upcoming visits on ${res.appointment_date_targeted}.`,
      });
      fetchAdminLiveMetrics();
    } catch (err) {
      setDashboardNotification({
        type: "error",
        message: `Reminder dispatch check failed: ${err.message}`,
      });
    } finally {
      setDispatchingReminders(false);
    }
  };

  const fetchPatientStats = async () => {
    try {
      const [appts, bills] = await Promise.all([
        appointmentApi.getMyAppointments().catch(() => []),
        billingApi.getMyBills().catch(() => [])
      ]);
      const upcoming = Array.isArray(appts)
        ? appts.filter((a) => a.status === "booked").length
        : 0;
      const unpaid = Array.isArray(bills)
        ? bills.filter((b) => b.status === "pending").length
        : 0;
      setPatientStats({ upcomingCount: upcoming, unpaidBills: unpaid });
    } catch (err) {
      console.warn("Could not load patient stats:", err);
    }
  };

  const fetchDoctors = async () => {
    setLoadingDoctors(true);
    try {
      const data = await doctorApi.listDoctors();
      setDoctorsList(data);
    } catch (err) {
      console.error("Failed to load doctors:", err);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const fetchDoctorSchedule = async () => {
    try {
      const sched = await doctorApi.getMySchedule();
      setMySchedule(sched);
    } catch (err) {
      console.warn("Could not load doctor schedule:", err);
    }
  };

  const fetchDoctorFollowUps = async () => {
    try {
      const data = await treatmentApi.getDoctorFollowUps();
      setFollowUps(data);
    } catch (err) {
      console.warn("Could not load doctor follow-ups:", err);
    }
  };

  const handleToggleStatus = async (doctor) => {
    const nextStatus = doctor.status === "active" ? "inactive" : "active";
    try {
      await doctorApi.toggleDoctorStatus(doctor.id, nextStatus);
      fetchDoctors();
    } catch (err) {
      alert("Failed to toggle status: " + err.message);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setStaffError(null);
    setStaffSuccess(null);
    setSubmittingStaff(true);
    try {
      await authApi.createStaffUser(newStaff);
      setStaffSuccess(`Successfully registered ${newStaff.name}`);
      setNewStaff({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "doctor",
        specialization: "General Dentist",
      });
      fetchDoctors();
      setTimeout(() => {
        setShowAddStaffModal(false);
        setStaffSuccess(null);
      }, 1400);
    } catch (err) {
      setStaffError(err.message);
    } finally {
      setSubmittingStaff(false);
    }
  };

  const handleQuickPatientSearch = async (e) => {
    const q = e.target.value;
    setQuickPatientQuery(q);
    if (!q.trim()) {
      setQuickPatients([]);
      return;
    }
    try {
      const results = await patientApi.searchPatients(q);
      setQuickPatients(results.slice(0, 5));
    } catch (err) {
      console.error(err);
    }
  };

  const activeStaffCount = doctorsList.filter((d) => d.status === "active").length;

  return (
    <div className="dashboard-container animate-fade-in">
      {/* Two-Column Page Header */}
      <div className="page-header-two-col">
        <div>
          <h1 className="page-header-greeting">Welcome back, {user?.name}</h1>
          <p className="page-header-subtext">
            {role === "admin" && "Clinic operations hub: manage practitioners, schedules, and clinical records."}
            {role === "doctor" && "Practitioner workspace: your schedule, assigned patients, and clinical treatments."}
            {role === "patient" && "Patient portal: your clinical history, invoices, and appointments."}
          </p>
        </div>
        <div className="page-header-hero-metric">
          {role === "admin" && (
            <>
              <div className="hero-metric-number">{todayAppointmentsCount}</div>
              <div className="hero-metric-label">Appointments today</div>
            </>
          )}
          {role === "doctor" && (
            <>
              <div className="hero-metric-number">{followUps.length}</div>
              <div className="hero-metric-label">Upcoming follow-ups</div>
            </>
          )}
          {role === "patient" && (
            <>
              <div className="hero-metric-number">{patientStats.upcomingCount}</div>
              <div className="hero-metric-label">Upcoming appointments</div>
            </>
          )}
        </div>
      </div>

      {/* Notification Toast */}
      {dashboardNotification && (
        <div style={{
          padding: "0.85rem 1.25rem",
          borderRadius: "var(--radius-btn)",
          marginBottom: "1.5rem",
          background: dashboardNotification.type === "success" ? "var(--success-bg)" : "var(--danger-bg)",
          border: `1px solid ${dashboardNotification.type === "success" ? "var(--success)" : "var(--danger)"}`,
          color: dashboardNotification.type === "success" ? "var(--accent)" : "var(--danger)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{dashboardNotification.message}</span>
          <button
            onClick={() => setDashboardNotification(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.2rem" }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Slim Horizontal Secondary Stats Strip (Hairline Dividers, NOT Cards) */}
      <div className="stats-strip">
        {role === "admin" && (
          <>
            <div className="stats-strip-item">
              <span className="stats-strip-value">{activeStaffCount}</span>
              <span className="stats-strip-label">Active practitioners</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value">₹{Number(outstandingBillsTotal || 0).toFixed(2)}</span>
              <span className="stats-strip-label">Outstanding balance</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value" style={{ color: reassignmentsNeeded.length > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                {reassignmentsNeeded.length}
              </span>
              <span className="stats-strip-label">Needs reassignment</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value" style={{ color: failedNotifications.length > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                {failedNotifications.length}
              </span>
              <span className="stats-strip-label">Delivery failures</span>
            </div>
          </>
        )}
        {role === "doctor" && (
          <>
            <div className="stats-strip-item">
              <span className="stats-strip-value">{mySchedule?.available_days?.length || 0}</span>
              <span className="stats-strip-label">Active weekly days</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value">{followUps.length}</span>
              <span className="stats-strip-label">Scheduled follow-ups</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value">Active</span>
              <span className="stats-strip-label">Duty status</span>
            </div>
          </>
        )}
        {role === "patient" && (
          <>
            <div className="stats-strip-item">
              <span className="stats-strip-value">{patientStats.upcomingCount}</span>
              <span className="stats-strip-label">Active visits</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value">{patientStats.unpaidBills}</span>
              <span className="stats-strip-label">Pending bills</span>
            </div>
            <div className="stats-strip-divider" />
            <div className="stats-strip-item">
              <span className="stats-strip-value">Verified</span>
              <span className="stats-strip-label">Patient account</span>
            </div>
          </>
        )}
      </div>

      {/* ADMIN VIEW */}
      {role === "admin" && (
        <div>
          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 500 }}>Clinic management</h2>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddStaffModal(true)}
              id="open-add-staff-modal-btn"
            >
              <UserPlus size={15} /> Add practitioner
            </button>
          </div>

          {/* Nav Shortcut Grid */}
          <div className="grid-cards" style={{ marginBottom: "2rem" }}>
            <div
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate("schedule")}
              id="admin-appointments-card"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 className="card-title" style={{ marginBottom: 0 }}>Master schedule</h3>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Daily roster, real-time slot occupancy, walk-in registration, and reassignment workflow.
              </p>
            </div>

            <div
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate("patients")}
              id="admin-patient-dir-card"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 className="card-title" style={{ marginBottom: 0 }}>Patient directory</h3>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Search clinical records, documented allergies, medical history, and past appointments.
              </p>
            </div>

            <div
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate("billing")}
              id="admin-billing-card"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 className="card-title" style={{ marginBottom: 0 }}>Billing ledger</h3>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Receivables, revenue summaries, invoice status updates, and treatment fee statements.
              </p>
            </div>
          </div>

          {/* ACTION REQUIRED: APPOINTMENTS REQUIRING REASSIGNMENT */}
          <div
            className="card"
            style={{
              marginBottom: "2rem",
              border: reassignmentsNeeded.length > 0 ? "1.5px solid var(--danger)" : "1px solid var(--border)",
            }}
            id="admin-reassignment-section"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShieldAlert size={18} color={reassignmentsNeeded.length > 0 ? "var(--danger)" : "var(--accent)"} />
                <h3 className="card-title" style={{ margin: 0 }}>
                  Appointments requiring reassignment ({reassignmentsNeeded.length})
                </h3>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Flagged when assigned practitioner schedule is deactivated
              </span>
            </div>

            {reassignmentsNeeded.length === 0 ? (
              <div style={{ padding: "1.25rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <CheckCircle2 size={20} color="var(--success)" />
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                  All scheduled visits have active practitioner assignments. No reassignments pending.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {reassignmentsNeeded.map((appt) => (
                  <div
                    key={appt.id}
                    style={{
                      background: "var(--danger-bg)",
                      border: "1px solid var(--danger)",
                      borderRadius: "var(--radius-btn)",
                      padding: "0.85rem 1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.75rem"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {appt.patient_name} <span style={{ color: "var(--text-secondary)", fontWeight: 400, fontSize: "0.85rem" }}>({appt.patient_phone})</span>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        Original: <strong>Dr. {appt.doctor_name}</strong> • Scheduled: <strong>{appt.date}</strong> at <strong>{appt.time_slot}</strong> • Reason: {appt.reason}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "0.4rem 0.85rem", fontSize: "0.825rem" }}
                      onClick={() => openReassignModal(appt)}
                      id={`dashboard-reassign-btn-${appt.id}`}
                    >
                      Reassign practitioner <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* NOTIFICATION FAILURES & REMINDER DISPATCH SECTION */}
          <div
            className="card"
            style={{
              marginBottom: "2rem",
              border: failedNotifications.length > 0 ? "1.5px solid var(--danger)" : "1px solid var(--border)",
            }}
            id="admin-notifications-section"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <BellOff size={18} color={failedNotifications.length > 0 ? "var(--danger)" : "var(--accent)"} />
                <h3 className="card-title" style={{ margin: 0 }}>
                  Notification delivery failures ({failedNotifications.length})
                </h3>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleDispatchReminders}
                  disabled={dispatchingReminders}
                  id="admin-dispatch-reminders-btn"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                >
                  <Send size={13} /> {dispatchingReminders ? "Checking..." : "Run 24h reminder check"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={fetchAdminLiveMetrics}
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                  id="admin-refresh-notifs-btn"
                >
                  <RotateCcw size={13} /> Refresh
                </button>
              </div>
            </div>

            {failedNotifications.length === 0 ? (
              <div style={{ padding: "1.25rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <CheckCircle2 size={20} color="var(--success)" />
                <div>
                  <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)" }}>
                    All notification delivery channels healthy
                  </p>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Zero delivery failures. All transactional emails, booking confirmations, reschedules, and 24-hour reminders delivered cleanly.
                  </p>
                </div>
              </div>
            ) : (
              <div className="table-container" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-btn)" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Channel</th>
                      <th>Type</th>
                      <th>Failure reason</th>
                      <th>Dispatched</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedNotifications.map((notif) => (
                      <tr key={notif.id} style={{ background: "var(--danger-bg)" }}>
                        <td>
                          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{notif.recipient}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>#{notif.id.slice(0, 8)}</div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span className="badge badge-neutral" style={{ textTransform: "uppercase", fontSize: "0.7rem" }}>
                            {notif.channel}
                          </span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: "0.825rem", color: "var(--text-primary)", fontWeight: 500 }}>
                            {notif.notification_type?.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          <span style={{ fontSize: "0.78rem", color: "var(--danger)", wordBreak: "break-word" }}>
                            {notif.failure_reason || "Connection or delivery failure"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {notif.created_at ? new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                            onClick={() => handleRetryNotification(notif.id)}
                            disabled={retryingNotificationId === notif.id}
                            id={`retry-notif-btn-${notif.id}`}
                          >
                            <RotateCcw size={12} /> {retryingNotificationId === notif.id ? "Retrying..." : "Retry"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Patient Search Bar */}
          <div className="card" style={{ marginBottom: "2rem" }}>
            <h3 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Search size={16} color="var(--accent)" /> Quick patient lookup
            </h3>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Type patient name or phone number..."
                value={quickPatientQuery}
                onChange={handleQuickPatientSearch}
                id="admin-quick-patient-search"
              />
              {quickPatients.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    marginTop: 4,
                    background: "#FFFFFF",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-btn)",
                    boxShadow: "0 8px 24px rgba(18, 38, 30, 0.08)",
                    overflow: "hidden",
                  }}
                >
                  {quickPatients.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => onNavigate("patients")}
                      style={{
                        padding: "0.75rem 1rem",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</span>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginLeft: 8 }}>({p.phone})</span>
                      </div>
                      {p.allergies && (
                        <span className="badge badge-patient" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                          Allergies disclosed
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Doctor Management Table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3 className="card-title" style={{ marginBottom: 0 }}>
                  Doctor profiles and availability schedules
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", marginTop: 2 }}>
                  Configure weekly working days, shifts, and practice status
                </p>
              </div>
              <button className="btn btn-secondary" onClick={fetchDoctors} style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}>
                Refresh
              </button>
            </div>

            {loadingDoctors ? (
              <p style={{ padding: "1.5rem", color: "var(--text-secondary)" }}>Loading practitioners...</p>
            ) : doctorsList.length === 0 ? (
              <p style={{ padding: "1.5rem", color: "var(--text-secondary)" }}>No doctors added yet.</p>
            ) : (
              <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Practitioner</th>
                      <th>Specialization</th>
                      <th>Working days</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorsList.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{doc.name}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{doc.email} • {doc.phone}</div>
                        </td>
                        <td>
                          <span className="badge badge-doctor">{doc.specialization}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                            {doc.available_days?.length ? doc.available_days.map((d) => d.substring(0, 3)).join(", ") : "None assigned"}
                          </span>
                        </td>
                        <td>
                          <span className="status-indicator">
                            <span className={`status-dot ${doc.status === "active" ? "status-dot-success" : "status-dot-neutral"}`} />
                            <span>{doc.status === "active" ? "Active" : "Inactive"}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setEditingDoctor(doc)}
                              style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                              id={`edit-doc-${doc.id}-btn`}
                            >
                              Edit schedule
                            </button>
                            <button
                              className={`btn ${doc.status === "active" ? "btn-outline" : "btn-secondary"}`}
                              onClick={() => handleToggleStatus(doc)}
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                              title="Toggle status"
                              id={`toggle-doc-${doc.id}-btn`}
                            >
                              {doc.status === "active" ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DOCTOR VIEW */}
      {role === "doctor" && (
        <div className="grid-cards">
          {/* Today's Schedule Card */}
          <div className="card">
            <h3 className="card-title">Daily schedule and roster</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
              Allocated patient appointments, time slots, and daily clinical consultations.
            </p>
            <div style={{ padding: "1.25rem", background: "var(--bg-section)", borderRadius: "var(--radius-card)", border: "1px solid var(--border)", textAlign: "center" }}>
              <Clock size={24} color="var(--accent)" style={{ marginBottom: "0.5rem" }} />
              <h4 style={{ fontWeight: 500, fontSize: "1rem", marginBottom: "0.25rem" }}>Consultation hub</h4>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", maxWidth: 360, margin: "0 auto 1rem auto" }}>
                View your scheduled appointments, examine patients, and document diagnoses.
              </p>
              <button
                className="btn btn-primary btn-block"
                onClick={() => onNavigate("schedule")}
                id="doctor-view-schedule-btn"
              >
                Open daily schedule <ArrowRight size={15} />
              </button>
            </div>
          </div>

          {/* Assigned Patients Quick Card */}
          <div className="card">
            <h3 className="card-title">Patient directory</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
              Access patient dental records, allergies, and treatment histories.
            </p>
            <div style={{ padding: "1.25rem", background: "var(--bg-section)", borderRadius: "var(--radius-card)", border: "1px solid var(--border)", marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Browse patient database, search by name or phone, and review allergies prior to clinical procedures.
              </p>
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={() => onNavigate("patients")}
              id="view-assigned-patients-btn"
            >
              Open patient directory <ArrowRight size={15} />
            </button>
          </div>

          {/* Doctor Schedule Card */}
          {mySchedule && (
            <div className="card" style={{ gridColumn: "span 2" }}>
              <h3 className="card-title">My weekly shift availability</h3>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.85rem" }}>
                Active working days: <strong>{mySchedule.available_days?.join(", ") || "None"}</strong>
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                {(mySchedule.available_days || []).map((day) => {
                  const slots = mySchedule.available_slots?.[day] || [];
                  return (
                    <div key={day} style={{ padding: "0.75rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
                      <p style={{ fontWeight: 600, color: "var(--accent)", fontSize: "0.85rem" }}>{day}</p>
                      {slots.length === 0 ? (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No shift configured</p>
                      ) : (
                        slots.map((s, idx) => (
                          <p key={idx} style={{ fontSize: "0.8rem", color: "var(--text-primary)", marginTop: 2 }}>
                            {s.start} - {s.end}
                          </p>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Follow-ups Widget */}
          <div className="card" style={{ gridColumn: "span 2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="card-title" style={{ marginBottom: 0 }}>
                Upcoming patient follow-ups ({followUps.length})
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                From completed clinical treatment records
              </span>
            </div>

            {followUps.length === 0 ? (
              <div style={{ padding: "1.5rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                No patient follow-ups currently scheduled. Document an appointment to add one.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
                {followUps.map((fu) => (
                  <div key={fu.treatment_record_id} style={{ padding: "0.85rem 1rem", background: "var(--bg-section)", border: "1px solid var(--border)", borderRadius: "var(--radius-btn)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                      <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>{fu.patient_name}</strong>
                      <span className="badge badge-patient" style={{ fontSize: "0.725rem" }}>
                        in {fu.days_until} day{fu.days_until === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Procedure: {fu.procedure}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      Scheduled: <strong>{fu.follow_up_date}</strong> • {fu.patient_phone}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PATIENT VIEW */}
      {role === "patient" && (
        <div className="grid-cards">
          <div
            className="card"
            style={{ cursor: "pointer", borderLeft: "3px solid var(--accent)" }}
            onClick={() => onNavigate("chat")}
            id="dashboard-ai-assistant-card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="card-title" style={{ marginBottom: 0 }}>AI Dental Assistant</h3>
              <ArrowRight size={16} color="var(--accent)" />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              Talk with our clinical AI assistant to check real-time availability, triage dental symptoms, and schedule consultations.
            </p>
            <div style={{ marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 500 }}>
              Start consultation chat <ArrowRight size={14} />
            </div>
          </div>

          <div
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("book")}
            id="dashboard-book-card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="card-title" style={{ marginBottom: 0 }}>Book visit</h3>
              <ArrowRight size={16} color="var(--text-secondary)" />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              Select specialization, pick your preferred dentist, and reserve a consultation slot.
            </p>
            <div style={{ marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 500 }}>
              Schedule visit now <ArrowRight size={14} />
            </div>
          </div>

          <div
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("my-appointments")}
            id="dashboard-my-appointments-card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="card-title" style={{ marginBottom: 0 }}>My appointments</h3>
              <ArrowRight size={16} color="var(--text-secondary)" />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              View upcoming visits, reschedule times, or cancel with automatic slot release.
            </p>
            <div style={{ marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 500 }}>
              Manage visits <ArrowRight size={14} />
            </div>
          </div>

          <div
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("records")}
            id="dashboard-records-card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="card-title" style={{ marginBottom: 0 }}>Treatment records</h3>
              <ArrowRight size={16} color="var(--text-secondary)" />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              Access diagnostic records, clinical procedures performed, and digital prescriptions.
            </p>
            <div style={{ marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 500 }}>
              View clinical history <ArrowRight size={14} />
            </div>
          </div>

          <div
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("bills")}
            id="dashboard-bills-card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="card-title" style={{ marginBottom: 0 }}>Bills and invoices</h3>
              <ArrowRight size={16} color="var(--text-secondary)" />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              Review itemized treatment statements, payment statuses, and outstanding balances.
            </p>
            <div style={{ marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 500 }}>
              View invoices <ArrowRight size={14} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Doctor Modal */}
      {editingDoctor && (
        <DoctorEditModal
          doctor={editingDoctor}
          onClose={() => setEditingDoctor(null)}
          onUpdated={() => {
            fetchDoctors();
            setEditingDoctor(null);
          }}
        />
      )}

      {/* Add Staff Modal for Admin */}
      {showAddStaffModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 500 }}>Add doctor or staff account</h3>
              <button
                onClick={() => setShowAddStaffModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            {staffError && (
              <div className="alert alert-error" id="create-staff-error">
                {staffError}
              </div>
            )}

            {staffSuccess && (
              <div className="alert alert-success" id="create-staff-success">
                {staffSuccess}
              </div>
            )}

            <form onSubmit={handleCreateStaff}>
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Dr. Jane Smith"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  id="new-staff-name-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="jane.smith@dcmsclinic.com"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  id="new-staff-email-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone number</label>
                <input
                  type="tel"
                  required
                  className="form-input"
                  placeholder="+15551234567"
                  value={newStaff.phone}
                  onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                  id="new-staff-phone-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Initial password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  id="new-staff-password-input"
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-select"
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                    id="new-staff-role-select"
                  >
                    <option value="doctor">Doctor / Practitioner</option>
                    <option value="admin">Clinic Administrator</option>
                  </select>
                </div>

                {newStaff.role === "doctor" && (
                  <div className="form-group">
                    <label className="form-label">Specialization</label>
                    <select
                      className="form-select"
                      value={newStaff.specialization}
                      onChange={(e) => setNewStaff({ ...newStaff, specialization: e.target.value })}
                      id="new-staff-spec-select"
                    >
                      <option value="General Dentist">General Dentist</option>
                      <option value="Orthodontist">Orthodontist</option>
                      <option value="Endodontist">Endodontist</option>
                      <option value="Pediatric Dentist">Pediatric Dentist</option>
                      <option value="Periodontist">Periodontist</option>
                      <option value="Oral Surgeon">Oral Surgeon</option>
                    </select>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={submittingStaff}
                id="submit-create-staff-btn"
                style={{ marginTop: "1rem" }}
              >
                {submittingStaff ? "Registering account..." : "Create staff account"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REASSIGN APPOINTMENT MODAL ON DASHBOARD */}
      {reassignAppt && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 500, padding: "1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)", margin: 0 }}>
                  Reassign appointment
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", margin: 0 }}>
                  Transfer to another practitioner with automatic conflict checking
                </p>
              </div>
              <button
                onClick={() => setReassignAppt(null)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Current details recap */}
            <div style={{ padding: "0.75rem 1rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", marginBottom: "1.25rem", fontSize: "0.825rem" }}>
              <div>Patient: <strong>{reassignAppt.patient_name}</strong></div>
              <div>Current: <span style={{ color: "var(--danger)" }}>Dr. {reassignAppt.doctor_name}</span> on {reassignAppt.date} at {reassignAppt.time_slot}</div>
              <div>Reason: {reassignAppt.reason}</div>
            </div>

            {reassignError && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                {reassignError}
              </div>
            )}

            <form onSubmit={handleReassignSubmit}>
              <div className="form-group">
                <label className="form-label">Target practitioner</label>
                <select
                  value={reassignDoctorId}
                  onChange={(e) => setReassignDoctorId(e.target.value)}
                  className="form-select"
                  id="dashboard-reassign-doctor-select"
                  required
                >
                  <option value="">-- Choose practitioner --</option>
                  {doctorsList.filter((d) => d.status === "active").map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.name} ({doc.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Target date</label>
                <input
                  type="date"
                  value={reassignDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setReassignDate(e.target.value)}
                  className="form-input"
                  id="dashboard-reassign-date-select"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Available slot {reassignSlots.length > 0 && `(${reassignSlots.length} available)`}
                </label>
                {reassignSlots.length === 0 ? (
                  <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>No free slots found on this date.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", maxHeight: 150, overflowY: "auto" }}>
                    {reassignSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`btn ${reassignSelectedSlot === slot ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}
                        onClick={() => setReassignSelectedSlot(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReassignAppt(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={reassignSubmitting || !reassignSelectedSlot}
                  id="dashboard-reassign-submit-btn"
                >
                  {reassignSubmitting ? "Reassigning..." : "Confirm reassignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
