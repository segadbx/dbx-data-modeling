import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from "react-router-dom";
import { Database, MessageSquare, GitBranch, ShieldCheck, GitCompare, PanelLeftClose, PanelLeftOpen, } from "lucide-react";
const ITEMS = [
    { to: "/", label: "Catalog", icon: Database, end: true },
    { to: "/chat", label: "Chat", icon: MessageSquare },
    { to: "/canvas", label: "Model Canvas", icon: GitBranch },
    { to: "/approvals", label: "Approvals", icon: ShieldCheck },
    { to: "/compare", label: "Compare", icon: GitCompare },
];
export function Sidebar({ collapsed, onToggle, }) {
    return (_jsxs("aside", { className: `sidebar${collapsed ? " collapsed" : ""}`, "aria-label": "Primary navigation", children: [_jsx("div", { className: "sidebar-section-label", children: "Workspace" }), _jsx("nav", { className: "sidebar-nav", children: ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (_jsxs(NavLink, { to: item.to, end: item.end, className: ({ isActive }) => `sidebar-nav-item${isActive ? " is-active" : ""}`, title: collapsed ? item.label : undefined, children: [_jsx(Icon, { "aria-hidden": true }), _jsx("span", { className: "sidebar-nav-item-label", children: item.label })] }, item.to));
                }) }), _jsx("div", { className: "sidebar-spacer" }), _jsxs("div", { className: "sidebar-footer", children: [_jsx("span", { className: "sidebar-version", children: "v0.1 \u00B7 Phase 0" }), _jsx("button", { type: "button", className: "sidebar-collapse-btn", onClick: onToggle, "aria-label": collapsed ? "Expand sidebar" : "Collapse sidebar", title: collapsed ? "Expand sidebar" : "Collapse sidebar", children: collapsed ? _jsx(PanelLeftOpen, { "aria-hidden": true }) : _jsx(PanelLeftClose, { "aria-hidden": true }) })] })] }));
}
