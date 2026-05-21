import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
import { AlertTriangle } from "lucide-react";
export class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error("UI ErrorBoundary caught:", error, info);
    }
    render() {
        if (this.state.error) {
            return (_jsx("div", { style: { padding: 24 }, children: _jsx("div", { className: "card card-pad", role: "alert", children: _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "flex-start" }, children: [_jsx("span", { style: {
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    background: "var(--danger-bg)",
                                    color: "var(--danger-strong)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }, children: _jsx(AlertTriangle, { size: 18 }) }), _jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: "var(--text-lg)" }, children: "Something went wrong" }), _jsx("p", { style: { marginTop: 4, color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }, children: "The page hit an unexpected error. Try reloading; if the problem persists, check the browser console." }), _jsx("pre", { style: {
                                            marginTop: 12,
                                            fontSize: 12,
                                            background: "var(--bg-sunken)",
                                            border: "1px solid var(--border-default)",
                                            borderRadius: 6,
                                            padding: 12,
                                            color: "var(--text-secondary)",
                                            overflow: "auto",
                                            maxHeight: 200,
                                        }, children: this.state.error.message })] })] }) }) }));
        }
        return this.props.children;
    }
}
