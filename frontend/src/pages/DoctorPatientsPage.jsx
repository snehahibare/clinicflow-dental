import React, { useState, useEffect } from "react";
import { patientApi } from "../api/patients";
import { doctorApi } from "../api/doctors";
import { useAuth } from "../context/AuthContext";
import { Search, User, AlertTriangle, Phone, Calendar, HeartPulse } from "lucide-react";

export function DoctorPatientsPage() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState(role === "doctor" ? "assigned" : "search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [assignedPatients, setAssignedPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (role === "doctor") {
      fetchAssignedPatients();
    }
    fetchSearchResults("");
  }, [role]);

  const fetchAssignedPatients = async () => {
    try {
      const data = await doctorApi.getMyAssignedPatients();
      setAssignedPatients(data);
    } catch (err) {
      console.error("Failed to load assigned patients:", err);
    }
  };

  const fetchSearchResults = async (query) => {
    setLoading(true);
    setError(null);
    try {
      const data = await patientApi.searchPatients(query);
      setSearchResults(data);
      if (data.length > 0 && !selectedPatient) {
        setSelectedPatient(data[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    fetchSearchResults(val);
  };

  const displayedPatients = activeTab === "assigned" ? assignedPatients : searchResults;

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="page-header-two-col" style={{ marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-header-greeting">Patient directory</h1>
          <p className="page-header-subtext">
            Search registered clinic patients, review allergies, emergency contacts, and past treatments
          </p>
        </div>
      </div>

      {role === "doctor" && (
        <div className="tab-group" style={{ maxWidth: 360, marginBottom: "1.5rem" }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === "assigned" ? "active" : ""}`}
            onClick={() => setActiveTab("assigned")}
          >
            My assigned patients ({assignedPatients.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "search" ? "active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            Clinic-wide search
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="card" style={{ padding: "0.85rem 1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Search size={18} color="var(--accent)" />
          <input
            type="text"
            className="form-input"
            style={{ border: "none", background: "transparent", fontSize: "0.95rem", padding: "0.4rem 0" }}
            placeholder="Search by patient name or phone number..."
            value={searchQuery}
            onChange={handleSearchChange}
            id="patient-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                fetchSearchResults("");
              }}
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.825rem" }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Split layout: Patient List on left, Detail panel on right */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "1.5rem" }}>
        {/* Left Column: Patient Cards */}
        <div>
          {loading ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
              <p style={{ color: "var(--text-secondary)" }}>Searching patients...</p>
            </div>
          ) : displayedPatients.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
              <p style={{ color: "var(--text-secondary)" }}>
                {activeTab === "assigned"
                  ? "No patients currently assigned."
                  : "No matching patients found."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {displayedPatients.map((p) => {
                const isSelected = selectedPatient?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    className="card"
                    style={{
                      padding: "1rem 1.25rem",
                      cursor: "pointer",
                      border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "var(--bg-section)" : "#FFFFFF",
                      transition: "var(--transition)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h4 style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</h4>
                        <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>{p.phone}</p>
                        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{p.email}</p>
                      </div>
                      {p.allergies && (
                        <span className="badge badge-patient" style={{ background: "var(--danger-bg)", color: "var(--danger)", borderColor: "var(--danger)" }}>
                          <AlertTriangle size={11} /> Allergies
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detailed Patient Profile */}
        <div>
          {selectedPatient ? (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", paddingBottom: "1.25rem", borderBottom: "1px solid var(--border)" }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--bg-section)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <User size={24} color="var(--accent)" />
                </div>
                <div>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 500, fontFamily: "var(--font-serif)" }}>{selectedPatient.name}</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>
                    Patient ID: <span style={{ fontFamily: "monospace" }}>{selectedPatient.id.substring(0, 8)}</span>
                  </p>
                </div>
              </div>

              {/* High visibility Allergies Alert */}
              <div
                style={{
                  padding: "0.85rem 1.15rem",
                  borderRadius: "var(--radius-btn)",
                  background: selectedPatient.allergies ? "var(--danger-bg)" : "var(--bg-section)",
                  border: selectedPatient.allergies ? "1px solid var(--danger)" : "1px solid var(--border)",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <AlertTriangle size={16} color={selectedPatient.allergies ? "var(--danger)" : "var(--accent)"} />
                  <span style={{ fontWeight: 600, fontSize: "0.825rem", color: selectedPatient.allergies ? "var(--danger)" : "var(--text-primary)" }}>
                    {selectedPatient.allergies ? "Known allergies and medical warnings" : "No known allergies reported"}
                  </span>
                </div>
                <p style={{ fontSize: "0.85rem", marginTop: "0.25rem", color: "var(--text-primary)" }}>
                  {selectedPatient.allergies || "Patient has not reported any drug or latex allergies."}
                </p>
              </div>

              {/* Medical Demographics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div style={{ padding: "0.75rem 0.85rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <Calendar size={13} /> Date of birth
                  </div>
                  <p style={{ fontWeight: 500, fontSize: "0.9rem" }}>{selectedPatient.dob || "Not specified"}</p>
                </div>

                <div style={{ padding: "0.75rem 0.85rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <User size={13} /> Gender
                  </div>
                  <p style={{ fontWeight: 500, fontSize: "0.9rem", textTransform: "capitalize" }}>{selectedPatient.gender || "Not specified"}</p>
                </div>

                <div style={{ padding: "0.75rem 0.85rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <Phone size={13} /> Primary phone
                  </div>
                  <p style={{ fontWeight: 500, fontSize: "0.9rem" }}>{selectedPatient.phone}</p>
                </div>

                <div style={{ padding: "0.75rem 0.85rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <Phone size={13} color="var(--accent)" /> Emergency contact
                  </div>
                  <p style={{ fontWeight: 500, fontSize: "0.9rem" }}>{selectedPatient.emergency_contact || "None on file"}</p>
                </div>
              </div>

              {/* Treatment History Section */}
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 500, marginBottom: "0.65rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <HeartPulse size={16} color="var(--accent)" />
                  Clinical treatment history
                </h4>
                <div style={{ padding: "1.25rem", background: "var(--bg-section)", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", textAlign: "center" }}>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>
                    No recorded treatment entries on file yet. Records documentations appear here automatically after visit completion.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
              <User size={30} color="var(--text-secondary)" style={{ marginBottom: "0.75rem" }} />
              <p style={{ color: "var(--text-secondary)" }}>Select a patient from the directory to review their clinical record and allergies.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
