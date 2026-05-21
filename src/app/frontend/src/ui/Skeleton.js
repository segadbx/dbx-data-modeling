import { jsx as _jsx } from "react/jsx-runtime";
export function Skeleton({ shape = "line", width, height, style, }) {
    return (_jsx("span", { className: `skeleton skeleton-${shape}`, style: { width, height, ...style }, "aria-hidden": true }));
}
