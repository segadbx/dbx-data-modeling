import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PageHeader({ eyebrow, title, description, actions, }) {
    return (_jsxs("header", { className: "page-header", children: [_jsxs("div", { className: "page-header-text", children: [eyebrow && _jsx("div", { className: "page-header-eyebrow", children: eyebrow }), _jsx("h1", { className: "page-header-title", children: title }), description && _jsx("p", { className: "page-header-desc", children: description })] }), actions && _jsx("div", { className: "page-header-actions", children: actions })] }));
}
