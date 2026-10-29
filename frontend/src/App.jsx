import React, { useState, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DashboardPage } from "./pages/DashboardPage";
import { PatientRecordsPage } from "./pages/PatientRecordsPage";
import { PatientBillsPage } from "./pages/PatientBillsPage";
import { DoctorPatientsPage } from "./pages/DoctorPatientsPage";
import { BookAppointmentPage } from "./pages/BookAppointmentPage";
import { MyAppointmentsPage } from "./pages/MyAppointmentsPage";
import { AdminSchedulePage } from "./pages/AdminSchedulePage";
import { DoctorSchedulePage } from "./pages/DoctorSchedulePage";
import { AdminBillingPage } from "./pages/AdminBillingPage";
import ChatAssistantPage from "./pages/ChatAssistantPage";

function getUrlForPage(page, role) {
  if (page === "login") return "/login";
  if (page === "register") return "/signup";
  if (page === "profile") return "/profile";

  if (role === "admin") {
    switch (page) {
      case "dashboard": return "/admin/dashboard";
      case "schedule": return "/admin/schedule";
      case "billing": return "/admin/billing";
      case "patients": return "/admin/patients";
      default: return "/admin/dashboard";
    }
  }

  if (role === "doctor") {
    switch (page) {
      case "dashboard": return "/doctor/dashboard";
      case "schedule": return "/doctor/schedule";
      case "patients": return "/doctor/patients";
      default: return "/doctor/dashboard";
    }
  }

  if (role === "patient") {
    switch (page) {
      case "dashboard": return "/patient/dashboard";
      case "book": return "/patient/book";
      case "my-appointments": return "/patient/appointments";
      case "records": return "/patient/records";
      case "bills": return "/patient/bills";
      case "chat": return "/patient/chat";
      default: return "/patient/dashboard";
    }
  }

  return "/";
}

function getPageFromUrl(pathname, isAuthenticated, role) {
  const path = (pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";

  if (!isAuthenticated) {
    if (path === "/signup" || path === "/register") return "register";
    return "login";
  }

  // Common authenticated routes
  if (path === "/profile") return "profile";

  // Admin and Doctor Schedule
  if (path === "/admin/schedule" || path === "/doctor/schedule" || path === "/schedule") return "schedule";
  if (path === "/admin/billing" || path === "/billing") return "billing";
  if (path === "/admin/patients" || path === "/doctor/patients" || path === "/patients") return "patients";

  // Dashboard routes
  if (path === "/admin/dashboard" || path === "/doctor/dashboard" || path === "/patient/dashboard" || path === "/dashboard" || path === "/") {
    return "dashboard";
  }

  // Patient routes
  if (path === "/patient/book" || path === "/book") return "book";
  if (path === "/patient/appointments" || path === "/my-appointments") return "my-appointments";
  if (path === "/patient/records" || path === "/records") return "records";
  if (path === "/patient/bills" || path === "/bills") return "bills";
  if (path === "/patient/chat" || path === "/chat") return "chat";

  // Default fallback
  return "dashboard";
}

function MainApp() {
  const { isAuthenticated, role, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState(() => {
    return getPageFromUrl(window.location.pathname, !!localStorage.getItem("dcms_access_token"), null);
  });

  // Sync state with URL whenever auth loads or user role changes
  useEffect(() => {
    if (!loading) {
      const pageFromUrl = getPageFromUrl(window.location.pathname, isAuthenticated, role);
      setCurrentPage(pageFromUrl);
      const expectedUrl = getUrlForPage(pageFromUrl, role);
      if (window.location.pathname !== expectedUrl) {
        window.history.replaceState({ page: pageFromUrl }, "", expectedUrl);
      }
    }
  }, [loading, isAuthenticated, role]);

  // Handle browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const page = getPageFromUrl(window.location.pathname, isAuthenticated, role);
      setCurrentPage(page);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isAuthenticated, role]);

  const navigate = useCallback((page) => {
    setCurrentPage(page);
    const targetUrl = getUrlForPage(page, role);
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({ page }, "", targetUrl);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [role]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-page)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "3px solid var(--border)",
            borderTopColor: "var(--accent)",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 1rem auto"
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Loading clinical system...</p>
        </div>
      </div>
    );
  }

  // Route guarding
  const renderPage = () => {
    if (!isAuthenticated) {
      if (currentPage === "register") {
        return <RegisterPage onNavigate={navigate} />;
      }
      return <LoginPage onNavigate={navigate} />;
    }

    switch (currentPage) {
      case "profile":
        return <ProfilePage />;
      case "records":
        return <PatientRecordsPage />;
      case "bills":
        return <PatientBillsPage />;
      case "patients":
        return <DoctorPatientsPage />;
      case "book":
        return <BookAppointmentPage onNavigate={navigate} />;
      case "my-appointments":
        return <MyAppointmentsPage onNavigate={navigate} />;
      case "schedule":
        return (
          <ErrorBoundary fallbackTitle="Something went wrong loading the schedule" onNavigate={navigate}>
            {role === "doctor" ? <DoctorSchedulePage /> : <AdminSchedulePage />}
          </ErrorBoundary>
        );
      case "billing":
        return <AdminBillingPage />;
      case "chat":
        return <ChatAssistantPage />;
      case "dashboard":
      default:
        return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="app-container">
      {isAuthenticated && <Navbar onNavigate={navigate} currentPage={currentPage} />}
      <main className="app-main">
        {renderPage()}
        {isAuthenticated && (
          <footer style={{
            marginTop: "auto",
            padding: "1.5rem 2rem",
            borderTop: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
            backgroundColor: "transparent"
          }}>
            DCMS clinical management system • Modern practice and scheduling portal
          </footer>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
