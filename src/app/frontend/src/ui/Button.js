import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
export const Button = forwardRef(function Button({ variant = "secondary", size = "md", leadingIcon, trailingIcon, loading = false, iconOnly = false, className, children, disabled, type = "button", ...rest }, ref) {
    const classes = [
        "btn",
        `btn-${variant}`,
        size !== "md" ? `btn-${size}` : "",
        loading ? "btn-loading" : "",
        iconOnly ? "btn-icon-only" : "",
        className ?? "",
    ]
        .filter(Boolean)
        .join(" ");
    return (_jsxs("button", { ref: ref, type: type, className: classes, disabled: disabled || loading, "aria-busy": loading || undefined, ...rest, children: [loading ? _jsx(Loader2, { "aria-hidden": true }) : leadingIcon, !iconOnly && children, !loading && trailingIcon] }));
});
