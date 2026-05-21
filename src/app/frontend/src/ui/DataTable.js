import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function DataTable({ columns, rows, rowKey, onRowClick, isRowSelected, className, emptyState, loading = false, skeletonRows = 6, }) {
    return (_jsx("div", { className: ["data-table-shell", className ?? ""].join(" "), children: _jsxs("div", { className: "data-table-scroll", children: [_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsx("tr", { children: columns.map((c) => (_jsx("th", { style: {
                                        width: c.width,
                                        textAlign: c.align ?? "left",
                                    }, children: c.header }, c.key))) }) }), _jsx("tbody", { children: loading
                                ? Array.from({ length: skeletonRows }).map((_, i) => (_jsx("tr", { children: columns.map((c) => (_jsx("td", { children: _jsx("span", { className: "skeleton skeleton-line", style: { width: "70%" } }) }, c.key))) }, `sk-${i}`)))
                                : rows.length === 0
                                    ? null
                                    : rows.map((row, i) => {
                                        const selected = isRowSelected?.(row) ?? false;
                                        return (_jsx("tr", { className: [
                                                selected ? "is-selected" : "",
                                                onRowClick ? "is-clickable" : "",
                                            ]
                                                .filter(Boolean)
                                                .join(" ") || undefined, onClick: onRowClick ? () => onRowClick(row) : undefined, children: columns.map((c) => (_jsx("td", { style: { textAlign: c.align ?? "left" }, children: c.render(row, i) }, c.key))) }, rowKey(row, i)));
                                    }) })] }), !loading && rows.length === 0 && emptyState && (_jsx("div", { className: "data-table-empty", children: emptyState }))] }) }));
}
