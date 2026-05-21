import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export function CopyChip({ value, display, title, }) {
    const [copied, setCopied] = useState(false);
    function copy(e) {
        e.stopPropagation();
        if (!navigator.clipboard)
            return;
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        });
    }
    return (_jsxs("button", { type: "button", className: "chip chip-copy", onClick: copy, title: title ?? `Copy ${value}`, children: [_jsx("code", { children: display ?? value }), copied ? _jsx(Check, { "aria-hidden": true }) : _jsx(Copy, { "aria-hidden": true })] }));
}
