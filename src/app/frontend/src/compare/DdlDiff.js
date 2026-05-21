import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui/Button";
const PLACEHOLDER = "-- (no DDL yet for this proposal)";
export default function DdlDiff({ a, b, titleA, titleB, }) {
    const [split, setSplit] = useState(true);
    const [hideUnchanged, setHideUnchanged] = useState(false);
    const [copied, setCopied] = useState(null);
    const aText = a ?? PLACEHOLDER;
    const bText = b ?? PLACEHOLDER;
    async function copy(side) {
        const text = side === "A" ? aText : bText;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(side);
            setTimeout(() => setCopied(null), 1500);
        }
        catch {
            // ignore
        }
    }
    return (_jsxs("div", { className: "ddl-diff", children: [_jsxs("div", { className: "ddl-diff-toolbar", children: [_jsxs("div", { className: "segmented", children: [_jsx("button", { type: "button", className: split ? "is-active" : "", onClick: () => setSplit(true), children: "Split" }), _jsx("button", { type: "button", className: !split ? "is-active" : "", onClick: () => setSplit(false), children: "Unified" })] }), _jsxs("label", { className: "ddl-diff-toggle", children: [_jsx("input", { type: "checkbox", checked: hideUnchanged, onChange: (e) => setHideUnchanged(e.target.checked), style: { accentColor: "var(--brand-500)" } }), "Hide unchanged lines"] }), _jsxs("div", { className: "ddl-diff-toolbar-right", style: { display: "inline-flex", gap: 6 }, children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: () => copy("A"), leadingIcon: copied === "A" ? _jsx(Check, { "aria-hidden": true }) : _jsx(Copy, { "aria-hidden": true }), children: copied === "A" ? "Copied" : "Copy A" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => copy("B"), leadingIcon: copied === "B" ? _jsx(Check, { "aria-hidden": true }) : _jsx(Copy, { "aria-hidden": true }), children: copied === "B" ? "Copied" : "Copy B" })] })] }), _jsx(ReactDiffViewer, { oldValue: aText, newValue: bText, splitView: split, leftTitle: titleA, rightTitle: titleB, compareMethod: DiffMethod.LINES, showDiffOnly: hideUnchanged, useDarkTheme: false, styles: {
                    variables: {
                        light: {
                            diffViewerBackground: "var(--bg-surface)",
                            diffViewerTitleBackground: "var(--bg-sunken)",
                            addedBackground: "#ecfdf5",
                            addedColor: "var(--success-strong)",
                            removedBackground: "#fef2f2",
                            removedColor: "var(--danger-strong)",
                            wordAddedBackground: "#bbf7d0",
                            wordRemovedBackground: "#fecaca",
                            addedGutterBackground: "#d1fae5",
                            removedGutterBackground: "#fee2e2",
                            gutterBackground: "var(--bg-sunken)",
                            gutterColor: "var(--text-quaternary)",
                        },
                    },
                    contentText: { fontFamily: "var(--font-mono)", fontSize: "12.5px" },
                }, renderContent: (value) => (_jsx("span", { 
                    // Prism returns HTML; we trust it because Prism only highlights, doesn't execute.
                    dangerouslySetInnerHTML: {
                        __html: Prism.highlight(value ?? "", Prism.languages.sql, "sql"),
                    } })) })] }));
}
