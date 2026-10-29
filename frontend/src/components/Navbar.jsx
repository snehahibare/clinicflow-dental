import React from "react";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Calendar,
  CreditCard,
  Users,
  FileText,
  PlusCircle,
  User,
  LogOut,
  Bot
} from "lucide-react";

export function Navbar({ onNavigate, currentPage }) {
  const { user, role, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const getRoleBadge = (r) => {
    switch (r) {
      case "admin":
        return <span className="badge badge-admin">Admin</span>;
      case "doctor":
        return <span className="badge badge-doctor">Doctor</span>;
      default:
        return <span className="badge badge-patient">Patient</span>;
    }
  };

  return (
    <aside className="app-sidebar" id="dcms-left-sidebar">
      <div>
        <div
          className="sidebar-brand"
          style={{ cursor: "pointer" }}
          onClick={() => onNavigate("dashboard")}
          id="nav-brand-logo"
        >
          <span className="sidebar-wordmark">DCMS</span>
          <span className="sidebar-tagline">Clinical system</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-link ${currentPage === "dashboard" ? "active" : ""}`}
            onClick={() => onNavigate("dashboard")}
            id="nav-dashboard-btn"
          >
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </button>

          {/* Patient navigation */}
          {role === "patient" && (
            <>
              <button
                className={`sidebar-link ${currentPage === "book" ? "active" : ""}`}
                onClick={() => onNavigate("book")}
                id="nav-book-btn"
              >
                <PlusCircle size={17} />
                <span>Book visit</span>
              </button>
              <button
                className={`sidebar-link ${currentPage === "chat" ? "active" : ""}`}
                onClick={() => onNavigate("chat")}
                id="nav-chat-btn"
              >
                <Bot size={17} />
                <span>AI assistant</span>
              </button>
              <button
                className={`sidebar-link ${currentPage === "my-appointments" ? "active" : ""}`}
                onClick={() => onNavigate("my-appointments")}
                id="nav-appointments-btn"
              >
                <Calendar size={17} />
                <span>My appointments</span>
              </button>
              <button
                className={`sidebar-link ${currentPage === "records" ? "active" : ""}`}
                onClick={() => onNavigate("records")}
                id="nav-records-btn"
              >
                <FileText size={17} />
                <span>Records</span>
              </button>
              <button
                className={`sidebar-link ${currentPage === "bills" ? "active" : ""}`}
                onClick={() => onNavigate("bills")}
                id="nav-bills-btn"
              >
                <CreditCard size={17} />
                <span>Bills</span>
              </button>
            </>
          )}

          {/* Doctor & Admin navigation */}
          {(role === "doctor" || role === "admin") && (
            <>
              <button
                className={`sidebar-link ${currentPage === "schedule" ? "active" : ""}`}
                onClick={() => onNavigate("schedule")}
                id="nav-schedule-btn"
              >
                <Calendar size={17} />
                <span>{role === "doctor" ? "Daily schedule" : "Master schedule"}</span>
              </button>
              {role === "admin" && (
                <button
                  className={`sidebar-link ${currentPage === "billing" ? "active" : ""}`}
                  onClick={() => onNavigate("billing")}
                  id="nav-billing-btn"
                >
                  <CreditCard size={17} />
                  <span>Billing ledger</span>
                </button>
              )}
              <button
                className={`sidebar-link ${currentPage === "patients" ? "active" : ""}`}
                onClick={() => onNavigate("patients")}
                id="nav-patients-btn"
              >
                <Users size={17} />
                <span>Patient directory</span>
              </button>
            </>
          )}

          <button
            className={`sidebar-link ${currentPage === "profile" ? "active" : ""}`}
            onClick={() => onNavigate("profile")}
            id="nav-profile-btn"
          >
            <User size={17} />
            <span>Profile</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user-block">
          <span className="sidebar-user-name" title={user?.name}>
            {user?.name || "User"}
          </span>
          <div style={{ marginTop: 4 }}>
            {getRoleBadge(user?.role)}
          </div>
        </div>
        <button
          className="sidebar-logout-btn"
          onClick={() => {
            logout();
            onNavigate("login");
          }}
          id="nav-logout-btn"
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
