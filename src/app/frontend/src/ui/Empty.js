import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Empty({ icon, title, description, action, }) {
    return (_jsxs("div", { className: "empty", role: "status", children: [icon && _jsx("div", { className: "empty-icon", children: icon }), _jsx("div", { className: "empty-title", children: title }), description && _jsx("div", { className: "empty-desc", children: description }), action && _jsx("div", { style: { marginTop: 12 }, children: action })] }));
}
