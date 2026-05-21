import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, } from "lucide-react";
const ToastContext = createContext(null);
const ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: XCircle,
};
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const counter = useRef(0);
    const remove = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    const toast = useCallback((input) => {
        counter.current += 1;
        const id = counter.current;
        const entry = { id, tone: "info", durationMs: 4500, ...input };
        setToasts((prev) => [...prev, entry]);
        if (entry.durationMs && entry.durationMs > 0) {
            window.setTimeout(() => remove(id), entry.durationMs);
        }
    }, [remove]);
    const value = useMemo(() => ({ toast }), [toast]);
    return (_jsxs(ToastContext.Provider, { value: value, children: [children, _jsx("div", { className: "toast-region", "aria-live": "polite", "aria-atomic": "false", children: toasts.map((t) => (_jsx(ToastItem, { toast: t, onDismiss: () => remove(t.id) }, t.id))) })] }));
}
function ToastItem({ toast, onDismiss, }) {
    const tone = toast.tone ?? "info";
    const Icon = ICONS[tone];
    return (_jsxs("div", { className: `toast toast-${tone}`, role: "status", children: [_jsx("span", { className: `toast-icon toast-icon-${tone}`, "aria-hidden": true, children: _jsx(Icon, { size: 18 }) }), _jsxs("div", { className: "toast-body", children: [_jsx("div", { className: "toast-title", children: toast.title }), toast.description && _jsx("div", { className: "toast-desc", children: toast.description })] }), _jsx("button", { type: "button", className: "toast-close", onClick: onDismiss, "aria-label": "Dismiss notification", children: _jsx(X, { "aria-hidden": true }) })] }));
}
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Allow useToast to be called outside provider without crashing — no-op
        return { toast: () => undefined };
    }
    return ctx;
}
// Tiny hook to surface a single async error as a toast for convenience.
export function useErrorToast(error) {
    const { toast } = useToast();
    useEffect(() => {
        if (!error)
            return;
        toast({
            tone: "danger",
            title: "Something went wrong",
            description: error instanceof Error ? error.message : String(error),
        });
    }, [error, toast]);
}
