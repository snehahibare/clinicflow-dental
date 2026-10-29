import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || "Something went wrong loading the schedule";
      return (
        <div style={{ padding: "3rem 1.5rem", maxWidth: 640, margin: "2rem auto" }}>
          <div
            className="card animate-fade-in"
            style={{
              padding: "2.5rem 2rem",
              textAlign: "center",
              border: "1.5px solid var(--danger)",
              borderRadius: "var(--radius-card)",
              background: "#FFFFFF",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--danger-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem auto",
              }}
            >
              <AlertTriangle size={28} color="var(--danger)" />
            </div>

            <h2
              style={{
                fontSize: "1.35rem",
                fontWeight: 500,
                color: "var(--text-primary)",
                fontFamily: "var(--font-serif)",
                marginBottom: "0.5rem",
              }}
            >
              {title}
            </h2>

            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
                lineHeight: 1.6,
              }}
            >
              An unexpected error occurred while rendering this section. You can retry loading or return to the main dashboard.
            </p>

            {this.state.error?.message && (
              <div
                style={{
                  background: "var(--bg-section)",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-btn)",
                  fontSize: "0.8rem",
                  color: "var(--danger)",
                  fontFamily: "monospace",
                  marginBottom: "1.5rem",
                  textAlign: "left",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                className="btn btn-primary"
                onClick={this.handleRetry}
                id="error-boundary-retry-btn"
              >
                <RefreshCw size={14} /> Try again
              </button>
              {this.props.onNavigate && (
                <button
                  className="btn btn-secondary"
                  onClick={() => this.props.onNavigate("dashboard")}
                >
                  Return to dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
