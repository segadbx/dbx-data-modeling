import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error("UI ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <div className="card card-pad" role="alert">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "var(--danger-bg)",
                  color: "var(--danger-strong)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Something went wrong</h2>
                <p style={{ marginTop: 4, color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
                  The page hit an unexpected error. Try reloading; if the problem persists, check the browser console.
                </p>
                <pre
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 6,
                    padding: 12,
                    color: "var(--text-secondary)",
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  {this.state.error.message}
                </pre>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
