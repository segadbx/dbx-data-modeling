import { jsx as _jsx } from "react/jsx-runtime";
import { CheckCircle2, Circle, CircleDashed, PlayCircle, XCircle, AlertTriangle, } from "lucide-react";
import { Badge } from "./Badge";
const MAP = {
    draft: { tone: "neutral", icon: CircleDashed, label: "Draft" },
    ready: { tone: "info", icon: Circle, label: "Ready" },
    approved: { tone: "success", icon: CheckCircle2, label: "Approved" },
    applied: { tone: "brand", icon: PlayCircle, label: "Applied" },
    rejected: { tone: "danger", icon: XCircle, label: "Rejected" },
    failed: { tone: "danger", icon: AlertTriangle, label: "Failed" },
    running: { tone: "warning", icon: PlayCircle, label: "Running" },
};
export function StatusPill({ status }) {
    const norm = (status || "").toLowerCase();
    const cfg = MAP[norm] ?? { tone: "neutral", icon: Circle, label: status || "—" };
    const Icon = cfg.icon;
    return (_jsx(Badge, { tone: cfg.tone, icon: _jsx(Icon, { "aria-hidden": true }), children: cfg.label }));
}
