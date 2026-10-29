import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { appointmentApi } from "../api/appointments";
import { doctorApi } from "../api/doctors";
import { patientApi } from "../api/patients";
import { TreatmentRecordModal } from "../components/TreatmentRecordModal";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Phone,
  CalendarDays,
  AlertCircle
} from "lucide-react";

export function AdminSchedulePage() {
  const { user, role } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const getMonday = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split("T")[0];
  };

  const [viewMode, setViewMode] = useState("day"); // 'day' | 'week'
  const [weekStartDate, setWeekStartDate] = useState(() => getMonday(new Date()));
  const [weekAppointments, setWeekAppointments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [reassignmentsNeeded, setReassignmentsNeeded] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Treatment Documentation state
  const [documentingAppt, setDocumentingAppt] = useState(null);

  // Manual Booking Modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [manualDoctorId, setManualDoctorId] = useState("");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [manualSlots, setManualSlots] = useState([]);
  const [manualSelectedSlot, setManualSelectedSlot] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState(null);

  // Reassignment Modal state
  const [reassignAppt, setReassignAppt] = useState(null);
  const [reassignDoctorId, setReassignDoctorId] = useState("");
  const [reassignDate, setReassignDate] = useState("");
  const [reassignSlots, setReassignSlots] = useState([]);
  const [reassignSelectedSlot, setReassignSelectedSlot] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [selectedDate, selectedDoctorId, viewMode, weekStartDate]);

  const fetchInitialData = async () => {
    try {
      const [docsData, reassignData] = await Promise.all([
        doctorApi.listDoctors(),
        appointmentApi.getReassignmentsNeeded(),
      ]);
      setDoctors(Array.isArray(docsData) ? docsData : []);
      setReassignmentsNeeded(Array.isArray(reassignData) ? reassignData : []);
    } catch (err) {
      console.error("Failed to load doctors or reassignments:", err);
    }
  };

  const fetchSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      if (viewMode === "week") {
        const weekRes = await appointmentApi.getAdminWeekSchedule(weekStartDate, selectedDoctorId || undefined);
        setWeekAppointments(Array.isArray(weekRes?.appointments) ? weekRes.appointments : []);
      } else {
        const data = await appointmentApi.getAdminSchedule(selectedDate, selectedDoctorId || undefined);
        setAppointments(Array.isArray(data) ? data : []);
      }
      const reassigns = await appointmentApi.getReassignmentsNeeded();
      setReassignmentsNeeded(Array.isArray(reassigns) ? reassigns : []);
    } catch (err) {
      setError(err.message || "Failed to load clinic schedule.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    const d = new Date(weekStartDate + "T00:00:00");
    d.setDate(d.getDate() - 7);
    setWeekStartDate(d.toISOString().split("T")[0]);
  };

  const handleNextWeek = () => {
    const d = new Date(weekStartDate + "T00:00:00");
    d.setDate(d.getDate() + 7);
    setWeekStartDate(d.toISOString().split("T")[0]);
  };

  const handleCurrentWeek = () => {
    setWeekStartDate(getMonday(new Date()));
  };

  const weekDays = React.useMemo(() => {
    const days = [];
    const start = new Date(weekStartDate + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      const dateStr = current.toISOString().split("T")[0];
      const dayName = current.toLocaleDateString("en-US", { weekday: "short" });
      const fullDate = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const isToday = dateStr === new Date().toISOString().split("T")[0];
      days.push({ dateStr, dayName, fullDate, isToday });
    }
    return days;
  }, [weekStartDate]);

  const setToday = () => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  const setTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // Debounced search for patient
  useEffect(() => {
    if (!patientSearchQuery.trim()) {
      setPatientSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await patientApi.searchPatients(patientSearchQuery);
        setPatientSearchResults(results);
      } catch (err) {
        console.error("Patient search failed:", err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearchQuery]);

  // Load slots when doctor or date changes in manual booking modal
  useEffect(() => {
    if (manualDoctorId && manualDate) {
      setManualSlots([]);
      setManualSelectedSlot("");
      appointmentApi.getAvailableSlots(manualDoctorId, manualDate)
        .then((res) => setManualSlots(res.available_slots || []))
        .catch(() => setManualSlots([]));
    }
  }, [manualDoctorId, manualDate]);

  // Load slots for reassignment target doctor & date
  useEffect(() => {
    if (reassignDoctorId && reassignDate) {
      setReassignSlots([]);
      setReassignSelectedSlot("");
      appointmentApi.getAvailableSlots(reassignDoctorId, reassignDate)
        .then((res) => setReassignSlots(res.available_slots || []))
        .catch(() => setReassignSlots([]));
    }
  }, [reassignDoctorId, reassignDate]);

  const handleManualBookSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient || !manualDoctorId || !manualDate || !manualSelectedSlot) {
      setManualError("Please complete all booking fields.");
      return;
    }

    setManualSubmitting(true);
    setManualError(null);
    try {
      await appointmentApi.adminBookAppointment({
        patient_id: selectedPatient.id,
        doctor_id: manualDoctorId,
        date: manualDate,
        time_slot: manualSelectedSlot,
        reason: manualReason.trim() || "Walk-In Consultation",
      });

      setNotification({
        type: "success",
        message: `Walk-in appointment booked successfully for ${selectedPatient.user?.name}.`,
      });
      setShowManualModal(false);
      setSelectedPatient(null);
      setManualReason("");
      setManualSelectedSlot("");
      fetchSchedule();
    } catch (err) {
      setManualError(err.message || "Failed to book appointment.");
    } finally {
      setManualSubmitting(false);
    }
  };

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

      setNotification({
        type: "success",
        message: `Appointment successfully reassigned to Dr. ${doctors.find(d => d.id === reassignDoctorId)?.user?.name || "Doctor"} for ${reassignDate} at ${reassignSelectedSlot}.`,
      });
      setReassignAppt(null);
      fetchSchedule();
    } catch (err) {
      setReassignError(err.message || "Failed to reassign appointment.");
    } finally {
      setReassignSubmitting(false);
    }
  };

  const getStatusBadge = (appt) => {
    if (appt.needs_reassignment) {
      return (
        <span className="status-indicator">
          <span className="status-dot status-dot-danger" />
          <span style={{ color: "var(--danger)", fontWeight: 500 }}>Needs reassignment</span>
        </span>
      );
    }
    if (appt.is_late_cancellation) {
      return (
        <span className="status-indicator">
          <span className="status-dot status-dot-warning" />
          <span style={{ color: "var(--warning)", fontWeight: 500 }}>Late cancel (&lt;2h)</span>
        </span>
      );
    }
    switch (appt.status) {
      case "booked":
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-accent" />
            <span>Booked</span>
          </span>
        );
      case "completed":
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-success" />
            <span>Completed</span>
          </span>
        );
      case "cancelled":
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-neutral" />
            <span style={{ color: "var(--text-secondary)" }}>Cancelled</span>
          </span>
        );
      case "no_show":
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-danger" />
            <span style={{ color: "var(--danger)" }}>No show</span>
          </span>
        );
      default:
        return (
          <span className="status-indicator">
            <span className="status-dot status-dot-neutral" />
            <span>{appt.status}</span>
          </span>
        );
    }
  };

  const getSourceBadge = (source) => {
    switch (source) {
      case "admin":
        return <span className="badge badge-neutral">Walk-in / phone</span>;
      case "chatbot":
        return <span className="badge badge-doctor">AI assistant</span>;
      default:
        return <span className="badge badge-patient">Patient app</span>;
    }
  };

  const activeDoctors = doctors.filter((d) => d.status === "active");

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">Clinic master schedule</h1>
          <p className="page-header-subtext">
            Daily doctor calendar, real-time slot occupancy, walk-in registration, and reassignment workflow
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* View mode toggle */}
          <div style={{
            display: "inline-flex",
            background: "var(--bg-section)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-btn)",
            padding: "0.2rem",
            marginRight: "0.25rem"
          }}>
            <button
              className={`btn ${viewMode === "day" ? "btn-primary" : "btn-secondary"}`}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.825rem", border: "none" }}
              onClick={() => setViewMode("day")}
              id="admin-view-day-btn"
            >
              Day view
            </button>
            <button
              className={`btn ${viewMode === "week" ? "btn-primary" : "btn-secondary"}`}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.825rem", border: "none" }}
              onClick={() => setViewMode("week")}
              id="admin-view-week-btn"
            >
              Week view
            </button>
          </div>

          <button
            className="btn btn-secondary"
            onClick={fetchSchedule}
            title="Refresh schedule"
            id="admin-refresh-btn"
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowManualModal(true);
              setManualError(null);
            }}
            id="admin-manual-book-btn"
          >
            <Plus size={15} /> Book walk-in / phone
          </button>
        </div>
      </div>

      {/* Notification toast */}
      {notification && (
        <div style={{
          padding: "0.85rem 1.25rem",
          borderRadius: "var(--radius-btn)",
          marginBottom: "1.5rem",
          background: notification.type === "success" ? "var(--success-bg)" : "var(--danger-bg)",
          border: `1px solid ${notification.type === "success" ? "var(--success)" : "var(--danger)"}`,
          color: notification.type === "success" ? "var(--accent)" : "var(--danger)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.2rem" }}
          >
            &times;
          </button>
        </div>
      )}

      {/* REASSIGNMENT ALERT BANNER */}
      {reassignmentsNeeded.length > 0 && (
        <div style={{
          background: "var(--danger-bg)",
          border: "1px solid var(--danger)",
          borderRadius: "var(--radius-card)",
          padding: "1.25rem 1.5rem",
          marginBottom: "2rem",
        }} id="reassignment-alert-banner">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <ShieldAlert size={22} color="var(--danger)" />
            <h3 style={{ color: "var(--danger)", margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
              Action required: {reassignmentsNeeded.length} appointment{reassignmentsNeeded.length > 1 ? "s" : ""} flagged for reassignment
            </h3>
          </div>
          <p style={{ color: "var(--text-primary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            A doctor was deactivated while future appointments were booked. Please reassign these patients to an active dentist.
          </p>

          <div style={{ display: "grid", gap: "0.6rem" }}>
            {reassignmentsNeeded.map((appt) => (
              <div
                key={appt.id}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-btn)",
                  padding: "0.75rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>{appt.patient_name}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>({appt.patient_phone})</span>
                  </div>
                  <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    Original: <strong>Dr. {appt.doctor_name}</strong> • Scheduled: <strong>{appt.date}</strong> at <strong>{appt.time_slot}</strong> • Reason: {appt.reason}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                  onClick={() => openReassignModal(appt)}
                  id={`reassign-btn-${appt.id}`}
                >
                  Reassign doctor <ArrowRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date & Filter Controls Strip */}
      <div className="card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          {viewMode === "day" ? (
            /* Day View Controls */
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <CalendarDays size={15} color="var(--accent)" /> Date:
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="form-input"
                style={{ padding: "0.4rem 0.65rem", width: 160 }}
                id="admin-date-picker"
              />
              <button
                className={`btn ${selectedDate === new Date().toISOString().split("T")[0] ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.825rem" }}
                onClick={setToday}
              >
                Today
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.825rem" }}
                onClick={setTomorrow}
              >
                Tomorrow
              </button>
            </div>
          ) : (
            /* Week View Controls */
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <CalendarDays size={15} color="var(--accent)" /> Week:
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.825rem" }}
                onClick={handlePrevWeek}
                id="prev-week-btn"
              >
                &larr; Prev week
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.825rem" }}
                onClick={handleCurrentWeek}
                id="current-week-btn"
              >
                This week
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.825rem" }}
                onClick={handleNextWeek}
                id="next-week-btn"
              >
                Next week &rarr;
              </button>
              <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)", marginLeft: "0.25rem" }}>
                {weekDays[0]?.formatted} &ndash; {weekDays[6]?.formatted}
              </span>
            </div>
          )}

          {/* Doctor Filter Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Filter size={15} color="var(--accent)" /> Filter practitioner:
            </span>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="form-select"
              style={{ padding: "0.4rem 0.65rem", minWidth: 200 }}
              id="admin-doctor-filter"
            >
              <option value="">All practitioners ({doctors.length})</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.user?.name} ({d.specialization}) {d.status === "inactive" ? "[Inactive]" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Practitioner Roster Summary */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
          Active practitioner roster ({activeDoctors.length} available)
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "0.85rem" }}>
          {activeDoctors.map((doc) => {
            const currentList = viewMode === "week" ? weekAppointments : appointments;
            const docApptCount = currentList.filter((a) => a.doctor_id === doc.id && a.status === "booked").length;
            const isFilterActive = selectedDoctorId === doc.id;
            return (
              <div
                key={doc.id}
                className="card"
                style={{
                  padding: "0.85rem 1rem",
                  background: isFilterActive ? "var(--bg-section)" : "#FFFFFF",
                  border: isFilterActive ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedDoctorId(selectedDoctorId === doc.id ? "" : doc.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: "0.925rem" }}>
                    Dr. {doc.user?.name}
                  </div>
                  <span className="badge badge-doctor" style={{ fontSize: "0.7rem" }}>
                    {doc.specialization}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  <span>{viewMode === "week" ? "Booked this week:" : "Booked today:"}</span>
                  <span style={{ fontWeight: 600, color: docApptCount > 0 ? "var(--accent)" : "var(--text-secondary)" }}>
                    {docApptCount} appointment{docApptCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Schedule Container */}
      {viewMode === "day" ? (
        /* DAY VIEW TABLE */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 500, margin: 0 }}>
              Schedule for {selectedDate} ({appointments.length} total)
            </h2>
            <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
              {appointments.filter((a) => a.status === "booked").length} active bookings
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}>
              <p style={{ color: "var(--text-secondary)" }}>Loading day schedule...</p>
            </div>
          ) : error ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--danger)" }}>
              <AlertCircle size={24} style={{ marginBottom: "0.5rem" }} />
              <p>{error}</p>
            </div>
          ) : appointments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3.5rem 1rem", color: "var(--text-secondary)" }}>
              <Calendar size={36} style={{ opacity: 0.3, marginBottom: "0.75rem" }} />
              <h4 style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: "0.5rem" }}>No appointments scheduled</h4>
              <p style={{ fontSize: "0.875rem", maxWidth: 400, margin: "0 auto 1.25rem auto" }}>
                There are no appointments on {selectedDate} for the selected criteria.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowManualModal(true);
                  setManualDate(selectedDate);
                }}
              >
                <Plus size={15} /> Book walk-in on {selectedDate}
              </button>
            </div>
          ) : (
            <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Time slot</th>
                    <th>Practitioner</th>
                    <th>Patient</th>
                    <th>Procedure / reason</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appt) => (
                    <tr
                      key={appt.id}
                      style={{
                        background: appt.needs_reassignment ? "var(--danger-bg)" : "transparent",
                      }}
                    >
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
                          <Clock size={14} color="var(--accent)" />
                          <span>{appt.time_slot.split("#")[0]}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>Dr. {appt.doctor_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{appt.specialization}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{appt.patient_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <Phone size={11} /> {appt.patient_phone}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <div style={{ fontSize: "0.85rem" }}>{appt.reason}</div>
                        {appt.cancellation_reason && (
                          <div style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "0.2rem" }}>
                            Reason: {appt.cancellation_reason}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {getSourceBadge(appt.created_via)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {getStatusBadge(appt)}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                          {appt.status === "booked" && role === "doctor" && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                              onClick={() => setDocumentingAppt(appt)}
                              id={`action-record-${appt.id}`}
                            >
                              <Stethoscope size={13} /> Add record
                            </button>
                          )}
                          {appt.status === "booked" && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                              onClick={() => openReassignModal(appt)}
                              id={`action-reassign-${appt.id}`}
                            >
                              Reassign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* WEEK VIEW 7-DAY GRID */
        <div className="card" style={{ padding: "1.25rem 1.5rem" }} id="admin-week-schedule-view">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 500, margin: 0 }}>
                Week view: {weekDays[0]?.formatted} &ndash; {weekDays[6]?.formatted} ({weekAppointments.length} appointments)
              </h2>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                7-day schedule across all practitioner chairs
              </p>
            </div>
            <span style={{ fontSize: "0.825rem", color: "var(--accent)", fontWeight: 600 }}>
              {weekAppointments.filter((a) => a.status === "booked").length} active bookings
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3.5rem 0" }}>
              <p style={{ color: "var(--text-secondary)" }}>Loading week schedule...</p>
            </div>
          ) : error ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--danger)" }}>
              <AlertCircle size={24} style={{ marginBottom: "0.5rem" }} />
              <p>{error}</p>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.75rem",
              alignItems: "stretch"
            }}>
              {weekDays.map((day) => {
                const dayAppts = weekAppointments.filter((a) => a.date === day.dateStr);
                return (
                  <div
                    key={day.dateStr}
                    style={{
                      background: day.isToday ? "var(--bg-section)" : "#FFFFFF",
                      border: day.isToday ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "var(--radius-card)",
                      padding: "0.75rem",
                      display: "flex",
                      flexDirection: "column",
                      minHeight: 280,
                    }}
                  >
                    {/* Day Column Header */}
                    <div style={{
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: "0.45rem",
                      marginBottom: "0.65rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.875rem", color: day.isToday ? "var(--accent)" : "var(--text-primary)" }}>
                          {day.dayName}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {day.formatted}
                        </div>
                      </div>
                      <span
                        className="badge badge-doctor"
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.15rem 0.45rem",
                          background: dayAppts.length > 0 ? "var(--accent)" : "var(--bg-section)",
                          color: dayAppts.length > 0 ? "#FFFFFF" : "var(--text-secondary)"
                        }}
                      >
                        {dayAppts.length}
                      </span>
                    </div>

                    {/* Day Appointments */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
                      {dayAppts.length === 0 ? (
                        <div style={{ padding: "1.5rem 0.25rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                          No visits
                        </div>
                      ) : (
                        dayAppts.map((appt) => (
                          <div
                            key={appt.id}
                            style={{
                              background: appt.needs_reassignment ? "var(--danger-bg)" : "var(--bg-page)",
                              border: `1px solid ${appt.needs_reassignment ? "var(--danger)" : "var(--border)"}`,
                              borderRadius: "var(--radius-btn)",
                              padding: "0.55rem 0.6rem",
                              fontSize: "0.75rem",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                {appt.time_slot.split("#")[0]}
                              </span>
                              {appt.needs_reassignment ? (
                                <span className="status-dot status-dot-danger" title="Needs reassignment" />
                              ) : appt.status === "booked" ? (
                                <span className="status-dot status-dot-accent" title="Booked" />
                              ) : (
                                <span className="status-dot status-dot-success" title="Completed" />
                              )}
                            </div>
                            <div style={{ fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {appt.patient_name}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              Dr. {appt.doctor_name}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {appt.reason}
                            </div>

                            {/* Reassignment action */}
                            {appt.needs_reassignment && (
                              <button
                                className="btn btn-primary"
                                style={{ padding: "0.2rem 0.4rem", fontSize: "0.68rem", marginTop: "0.35rem", width: "100%" }}
                                onClick={() => openReassignModal(appt)}
                              >
                                Reassign
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MANUAL BOOKING MODAL (WALK-IN / PHONE) */}
      {showManualModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade-in" style={{ maxWidth: 540, maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)", margin: 0 }}>
                  Book walk-in / phone visit
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", margin: 0 }}>
                  Created with instant clinical scheduling confirmation
                </p>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
              >
                ✕
              </button>
            </div>

            {manualError && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                {manualError}
              </div>
            )}

            <form onSubmit={handleManualBookSubmit}>
              {/* Step 1: Select Patient */}
              <div className="form-group">
                <label className="form-label">1. Search patient (name or phone)</label>
                {selectedPatient ? (
                  <div style={{
                    padding: "0.75rem 1rem",
                    background: "var(--bg-section)",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-btn)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                        {selectedPatient.user?.name}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        Phone: {selectedPatient.user?.phone} • Email: {selectedPatient.user?.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => setSelectedPatient(null)}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        value={patientSearchQuery}
                        onChange={(e) => setPatientSearchQuery(e.target.value)}
                        placeholder="Type patient name or phone number..."
                        className="form-input"
                        style={{ paddingLeft: "2.25rem" }}
                        id="manual-patient-search"
                      />
                      <Search size={15} color="var(--text-secondary)" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                    </div>

                    {patientSearchResults.length > 0 && (
                      <div style={{
                        marginTop: "0.35rem",
                        maxHeight: 150,
                        overflowY: "auto",
                        background: "#FFFFFF",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-btn)",
                        boxShadow: "0 4px 12px rgba(18, 38, 30, 0.08)"
                      }}>
                        {patientSearchResults.map((pat) => (
                          <div
                            key={pat.id}
                            style={{
                              padding: "0.55rem 0.85rem",
                              borderBottom: "1px solid var(--border)",
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center"
                            }}
                            onClick={() => {
                              setSelectedPatient(pat);
                              setPatientSearchQuery("");
                              setPatientSearchResults([]);
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{pat.user?.name}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{pat.user?.phone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Select Doctor */}
              <div className="form-group">
                <label className="form-label">2. Select practitioner</label>
                <select
                  value={manualDoctorId}
                  onChange={(e) => setManualDoctorId(e.target.value)}
                  className="form-select"
                  id="manual-doctor-select"
                  required
                >
                  <option value="">-- Choose active practitioner --</option>
                  {activeDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.user?.name} - {doc.specialization}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3: Date Picker */}
              <div className="form-group">
                <label className="form-label">3. Appointment date</label>
                <input
                  type="date"
                  value={manualDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="form-input"
                  id="manual-date-select"
                  required
                />
              </div>

              {/* Step 4: Available Slot Picker */}
              <div className="form-group">
                <label className="form-label">
                  4. Free time slot {manualSlots.length > 0 && `(${manualSlots.length} available)`}
                </label>
                {!manualDoctorId ? (
                  <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>Select a doctor first.</p>
                ) : manualSlots.length === 0 ? (
                  <p style={{ fontSize: "0.825rem", color: "var(--danger)" }}>No free slots on this date.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", maxHeight: 150, overflowY: "auto" }}>
                    {manualSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`btn ${manualSelectedSlot === slot ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}
                        onClick={() => setManualSelectedSlot(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 5: Procedure / Reason */}
              <div className="form-group">
                <label className="form-label">5. Procedure / visit reason</label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="e.g. Toothache, Scaling, Routine checkup"
                  className="form-input"
                  id="manual-reason-input"
                  required
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowManualModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={manualSubmitting || !selectedPatient || !manualSelectedSlot}
                  id="manual-submit-btn"
                >
                  {manualSubmitting ? "Booking..." : "Confirm booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REASSIGN APPOINTMENT MODAL */}
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
                  id="reassign-doctor-select"
                  required
                >
                  <option value="">-- Choose practitioner --</option>
                  {activeDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.user?.name} ({doc.specialization})
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
                  id="reassign-date-select"
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
                  id="reassign-submit-btn"
                >
                  {reassignSubmitting ? "Reassigning..." : "Confirm reassignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TREATMENT RECORD MODAL */}
      {documentingAppt && (
        <TreatmentRecordModal
          appointment={documentingAppt}
          onClose={() => setDocumentingAppt(null)}
          onSuccess={() => {
            fetchSchedule();
            setNotification({
              type: "success",
              message: `Clinical treatment record saved for ${documentingAppt.patient_name} and appointment marked Completed.`,
            });
          }}
        />
      )}
    </div>
  );
}
