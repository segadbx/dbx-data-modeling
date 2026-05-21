import { jsxs as _jsxs } from "react/jsx-runtime";
export function Badge({ tone = "neutral", square = false, solid = false, icon, children, }) {
    const classes = [
        "badge",
        `badge-${tone}`,
        square ? "badge-square" : "",
        solid ? "badge-solid" : "",
    ]
        .filter(Boolean)
        .join(" ");
    return (_jsxs("span", { className: classes, children: [icon, children] }));
}
