import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { ChevronRight, HelpCircle, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
const THEME_KEY = "modeler.theme";
function getInitialTheme() {
    if (typeof window === "undefined")
        return "light";
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light")
        return stored;
    return "light";
}
function useTheme() {
    const [theme, setTheme] = useState(getInitialTheme);
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        window.localStorage.setItem(THEME_KEY, theme);
    }, [theme]);
    return { theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) };
}
export function Topbar() {
    const { theme, toggle } = useTheme();
    return (_jsxs("header", { className: "topbar", role: "banner", children: [_jsxs("div", { className: "topbar-left", children: [_jsxs(Link, { to: "/", className: "topbar-brand", "aria-label": "Dimensional Modeler \u2014 Home", children: [_jsx("span", { className: "topbar-logo", "aria-hidden": true, children: "M" }), _jsxs("span", { className: "topbar-title", children: [_jsx("span", { className: "topbar-title-name", children: "Dimensional Modeler" }), _jsx("span", { className: "topbar-title-product", children: "Databricks \u00B7 Lakehouse" })] })] }), _jsx("span", { className: "topbar-divider", "aria-hidden": true }), _jsxs("nav", { className: "topbar-breadcrumb", "aria-label": "Workspace", children: [_jsx("span", { className: "topbar-breadcrumb-segment", children: "data_modeling" }), _jsx(ChevronRight, { "aria-hidden": true }), _jsx("span", { className: "topbar-breadcrumb-segment is-strong", children: "gold" })] })] }), _jsxs("div", { className: "topbar-right", children: [_jsx("button", { type: "button", className: "topbar-iconbtn", onClick: toggle, "aria-label": theme === "light" ? "Switch to dark theme" : "Switch to light theme", title: "Toggle theme", children: theme === "light" ? _jsx(Moon, { "aria-hidden": true }) : _jsx(Sun, { "aria-hidden": true }) }), _jsx("a", { className: "topbar-iconbtn", href: "https://docs.databricks.com/en/data-modeling/index.html", target: "_blank", rel: "noreferrer noopener", "aria-label": "Help and docs", title: "Documentation", children: _jsx(HelpCircle, { "aria-hidden": true }) }), _jsx("div", { className: "topbar-avatar", "aria-label": "Signed in user", title: "Signed in", children: "ME" })] })] }));
}
