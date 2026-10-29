import React, { useState, useEffect } from "react";
import { doctorApi } from "../api/doctors";
import { appointmentApi } from "../api/appointments";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  BellRing
} from "lucide-react";

const DEPARTMENTS = [
  { id: "General Dentist", name: "General dentistry", desc: "Routine cleaning, checkups, cavity fillings, and preventive oral care" },
  { id: "Orthodontist", name: "Orthodontics", desc: "Braces, aligners, bite corrections, and jaw alignment treatments" },
  { id: "Endodontist", name: "Endodontics", desc: "Root canal therapy, cracked tooth repair, and pulpal pain treatment" },
  { id: "Pediatric Dentist", name: "Pediatric dentistry", desc: "Specialized dental care for infants, children, and teenagers" },
  { id: "Periodontist", name: "Periodontics", desc: "Gum disease treatment, dental implants, and cosmetic periodontal surgery" },
  { id: "Oral Surgeon", name: "Oral surgery", desc: "Wisdom teeth extractions, surgical corrective jaw procedures, and implants" },
];

export function BookAppointmentPage({ onNavigate }) {
  const [step, setStep] = useState(1); // 1: Reason/Dept, 2: Doctor, 3: Date/Slot, 4: Confirmed
  const [selectedDept, setSelectedDept] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // Default to tomorrow
    return d.toISOString().split("T")[0];
  });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [reason, setReason] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  useEffect(() => {
    doctorApi.listDoctors({ status: "active" })
      .then((data) => setDoctors(data))
      .catch((err) => console.error("Failed to fetch doctors:", err));
  }, []);

  const filteredDoctors = selectedDept
    ? doctors.filter((d) => d.specialization.toLowerCase() === selectedDept.toLowerCase())
    : doctors;

  useEffect(() => {
    if (selectedDoctor && date) {
      setLoadingSlots(true);
      setError(null);
      setSelectedSlot("");
      appointmentApi.getAvailableSlots(selectedDoctor.id, date)
        .then((res) => {
          setAvailableSlots(res.available_slots || []);
          if (!res.is_working_day && res.message) {
            setError(res.message);
          }
        })
        .catch((err) => {
          setError(err.message);
          setAvailableSlots([]);
        })
        .finally(() => setLoadingSlots(false));
    }
  }, [selectedDoctor, date]);

  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      setError("Please select an available consultation slot.");
      return;
    }
    setError(null);
    setBookingLoading(true);
    try {
      const payload = {
        doctor_id: selectedDoctor.id,
        date: date,
        time_slot: selectedSlot,
        reason: reason.trim() || `${selectedDept || "General"} consultation`,
      };
      const res = await appointmentApi.bookAppointment(payload);
      setConfirmedBooking(res);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="dashboard-container animate-fade-in" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">Book an appointment</h1>
          <p className="page-header-subtext">Reserve your clinical consultation with a specialist</p>
        </div>
        <div className="page-header-hero-metric">
          <div className="hero-metric-number" style={{ fontSize: "2rem" }}>
            {step < 4 ? `Step ${step}` : "Confirmed"}
          </div>
          <div className="hero-metric-label">{step < 4 ? "of 3 in booking flow" : "Ready for visit"}</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" id="booking-error-alert" style={{ marginBottom: "1.5rem" }}>
          <AlertCircle size={17} /> <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Department / Reason */}
      {step === 1 && (
        <div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 500, marginBottom: "1rem" }}>
            Select specialization or department
          </h3>
          <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
            {DEPARTMENTS.map((dept) => (
              <div
                key={dept.id}
                onClick={() => {
                  setSelectedDept(dept.id);
                  setStep(2);
                }}
                className="card"
                style={{
                  cursor: "pointer",
                  border: selectedDept === dept.id ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  transition: "var(--transition)",
                }}
                id={`dept-${dept.id.replace(/\s+/g, "-")}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h4 style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-primary)" }}>{dept.name}</h4>
                  <ArrowRight size={15} color="var(--accent)" />
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", lineHeight: 1.5 }}>
                  {dept.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Choose Doctor */}
      {step === 2 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 500 }}>
                Select your attending practitioner
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Specialization: <strong>{selectedDept}</strong>
              </p>
            </div>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={15} /> Change department
            </button>
          </div>

          {filteredDoctors.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
              <Stethoscope size={30} color="var(--text-secondary)" style={{ marginBottom: "0.75rem" }} />
              <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
                No active doctors registered under {selectedDept} currently.
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedDept(null);
                }}
              >
                View all clinic doctors
              </button>
            </div>
          ) : (
            <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {filteredDoctors.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => {
                    setSelectedDoctor(doc);
                    setStep(3);
                  }}
                  className="card"
                  style={{
                    cursor: "pointer",
                    border: selectedDoctor?.id === doc.id ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    transition: "var(--transition)",
                  }}
                  id={`doc-${doc.id}-card`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-section)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <User size={20} color="var(--accent)" />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 500, fontSize: "1rem" }}>{doc.name}</h4>
                      <span className="badge badge-doctor" style={{ fontSize: "0.725rem" }}>
                        {doc.specialization}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Available: <strong>{doc.available_days?.map(d => d.substring(0, 3)).join(", ")}</strong>
                  </p>

                  <div style={{ marginTop: "1rem", textAlign: "right" }}>
                    <span style={{ fontSize: "0.825rem", fontWeight: 500, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Select time slot <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Date & Calendar Slot Picker */}
      {step === 3 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 500 }}>
                Choose date and available time slot
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Consultation with <strong>{selectedDoctor?.name}</strong> ({selectedDoctor?.specialization})
              </p>
            </div>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={15} /> Change practitioner
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "2rem" }}>
            {/* Left: Date Picker & Reason */}
            <div>
              <div className="form-group">
                <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={15} color="var(--accent)" /> Appointment date
                </label>
                <input
                  type="date"
                  min={todayStr}
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  id="booking-date-input"
                />
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 4 }}>
                  {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </p>
              </div>

              <div className="form-group" style={{ marginTop: "1.25rem" }}>
                <label className="form-label">Reason for visit</label>
                <textarea
                  rows={3}
                  className="form-textarea"
                  placeholder="e.g. Tooth sensitivity, regular cleaning, consultation..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  id="booking-reason-input"
                />
              </div>

              {selectedSlot && (
                <div style={{ padding: "0.85rem 1rem", background: "var(--success-bg)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", marginTop: "1rem" }}>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Selected slot</p>
                  <p style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>{selectedSlot}</p>
                </div>
              )}
            </div>

            {/* Right: Slot Buttons Grid */}
            <div>
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={15} color="var(--accent)" /> Available 30-minute slots
              </label>

              {loadingSlots ? (
                <div style={{ textAlign: "center", padding: "2.5rem" }}>
                  <p style={{ color: "var(--text-secondary)" }}>Loading available slots...</p>
                </div>
              ) : availableSlots.length === 0 ? (
                <div style={{ padding: "2rem 1rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px dashed var(--border)", textAlign: "center" }}>
                  <Clock size={24} color="var(--text-secondary)" style={{ marginBottom: "0.5rem" }} />
                  <p style={{ color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 500 }}>
                    No slots available on this date
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: 4 }}>
                    Try selecting another day from {selectedDoctor?.available_days?.join(", ")}.
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "0.5rem", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
                  {availableSlots.map((slot) => {
                    const isSelected = selectedSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`btn ${isSelected ? "btn-primary" : "btn-secondary"}`}
                        style={{
                          padding: "0.5rem 0.4rem",
                          fontSize: "0.825rem",
                          fontWeight: 500,
                        }}
                        id={`slot-${slot.replace(/\s+/g, "")}`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={!selectedSlot || bookingLoading}
                onClick={handleConfirmBooking}
                id="confirm-booking-btn"
                style={{ marginTop: "1.5rem" }}
              >
                {bookingLoading ? "Confirming appointment..." : "Confirm and book appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: In-App Confirmation */}
      {step === 4 && confirmedBooking && (
        <div className="card animate-fade-in" style={{ textAlign: "center", padding: "3rem 2rem", maxWidth: 580, margin: "0 auto" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem auto" }}>
            <CheckCircle size={28} color="var(--success)" />
          </div>

          <h2 style={{ fontSize: "1.5rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
            Appointment confirmed
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.75rem" }}>
            Your consultation has been recorded on the clinic schedule.
          </p>

          <div style={{ background: "var(--bg-section)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.25rem", textAlign: "left", marginBottom: "1.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.875rem" }}>
              <div>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>Practitioner</span>
                <p style={{ fontWeight: 500, marginTop: 2 }}>{confirmedBooking.doctor_name}</p>
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{confirmedBooking.specialization}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>Date and time</span>
                <p style={{ fontWeight: 500, marginTop: 2 }}>{confirmedBooking.date}</p>
                <p style={{ fontSize: "0.825rem", color: "var(--accent)", fontWeight: 500 }}>{confirmedBooking.time_slot}</p>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>Reason</span>
                <p style={{ fontWeight: 500, marginTop: 2 }}>{confirmedBooking.reason}</p>
              </div>
            </div>

            <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, color: "var(--success)", fontSize: "0.8rem" }}>
              <BellRing size={15} />
              <span>Confirmation details logged to clinical notification service.</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
            <button className="btn btn-primary" onClick={() => onNavigate("my-appointments")} id="view-my-appts-btn">
              View my appointments
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate("dashboard")}>
              Back to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
