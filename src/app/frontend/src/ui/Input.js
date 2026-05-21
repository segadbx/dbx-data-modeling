import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef, } from "react";
export const Input = forwardRef(function Input({ className, leadingIcon, ...rest }, ref) {
    if (leadingIcon) {
        return (_jsxs("div", { className: "input-with-icon", children: [_jsx("span", { className: "input-with-icon-glyph", "aria-hidden": true, children: leadingIcon }), _jsx("input", { ref: ref, className: ["input", className ?? ""].join(" "), ...rest })] }));
    }
    return _jsx("input", { ref: ref, className: ["input", className ?? ""].join(" "), ...rest });
});
export const TextArea = forwardRef(function TextArea({ className, ...rest }, ref) {
    return _jsx("textarea", { ref: ref, className: ["textarea", className ?? ""].join(" "), ...rest });
});
