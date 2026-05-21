import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
const COLLAPSE_KEY = "modeler.sidebar.collapsed";
export function AppShell({ children }) {
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === "undefined")
            return false;
        return window.localStorage.getItem(COLLAPSE_KEY) === "true";
    });
    useEffect(() => {
        window.localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    }, [collapsed]);
    return (_jsxs("div", { className: `app-shell${collapsed ? " collapsed" : ""}`, children: [_jsx(Topbar, {}), _jsx(Sidebar, { collapsed: collapsed, onToggle: () => setCollapsed((c) => !c) }), _jsx("main", { className: "content", role: "main", children: _jsx("div", { className: "content-wrap", children: children }) })] }));
}
