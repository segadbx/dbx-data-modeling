import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Card({ children, flush, className, ...rest }) {
    const classes = ["card", flush ? "" : "", className ?? ""].filter(Boolean).join(" ");
    return (_jsx("div", { className: classes, ...rest, children: children }));
}
export function CardHeader({ title, subtitle, actions, children }) {
    return (_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [title && _jsx("div", { className: "card-header-title", children: title }), subtitle && _jsx("div", { className: "card-header-subtitle", children: subtitle }), children] }), actions && _jsx("div", { style: { display: "flex", gap: 8 }, children: actions })] }));
}
export function CardBody({ children, flush = false, className, }) {
    const classes = ["card-body", flush ? "card-body-flush" : "", className ?? ""]
        .filter(Boolean)
        .join(" ");
    return _jsx("div", { className: classes, children: children });
}
export function CardFooter({ children }) {
    return _jsx("div", { className: "card-footer", children: children });
}
