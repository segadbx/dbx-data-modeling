import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Database, FileText, Search, TableIcon } from "lucide-react";
import { describeTable, listTables } from "../api/client";
import { PageHeader } from "../ui/PageHeader";
import { DataTable } from "../ui/DataTable";
import { Empty } from "../ui/Empty";
import { Input } from "../ui/Input";
import { Card, CardBody } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { Badge } from "../ui/Badge";
import { CopyChip } from "../ui/CopyChip";
import { useToast } from "../ui/Toast";
export default function Catalog() {
    const [tables, setTables] = useState(null);
    const [selected, setSelected] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [query, setQuery] = useState("");
    const { toast } = useToast();
    useEffect(() => {
        listTables()
            .then(setTables)
            .catch((e) => toast({ tone: "danger", title: "Failed to load catalog", description: String(e) }));
    }, [toast]);
    const filtered = useMemo(() => {
        if (!tables)
            return [];
        const q = query.trim().toLowerCase();
        if (!q)
            return tables;
        return tables.filter((t) => t.name.toLowerCase().includes(q) || t.comment?.toLowerCase().includes(q));
    }, [tables, query]);
    function loadDetail(t) {
        setLoadingDetail(true);
        describeTable(t.name)
            .then((d) => setSelected(d))
            .catch((e) => toast({ tone: "danger", title: "Failed to load table", description: String(e) }))
            .finally(() => setLoadingDetail(false));
    }
    const columns = [
        {
            key: "name",
            header: "Table",
            render: (t) => (_jsxs("span", { className: "catalog-table-name", children: [_jsx(TableIcon, { size: 14, style: { verticalAlign: "-3px", marginRight: 6, color: "var(--text-quaternary)" } }), t.name] })),
        },
        {
            key: "comment",
            header: "Description",
            render: (t) => (_jsx("span", { className: "catalog-table-comment", title: t.comment, children: t.comment || _jsx("span", { style: { color: "var(--text-quaternary)" }, children: "\u2014" }) })),
        },
    ];
    return (_jsxs("div", { className: "page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(Database, { size: 12 }), " Unity Catalog"] }), title: "Silver catalog", description: "Cleaned, conformed source tables ready for dimensional modeling. Click a table to inspect its schema.", actions: _jsx(Badge, { tone: "neutral", icon: _jsx(Database, { size: 12 }), children: tables ? `${tables.length} tables` : "loading…" }) }), _jsxs("div", { className: "two-pane two-pane-narrow-left", children: [_jsxs(Card, { flush: true, children: [_jsx("div", { className: "catalog-list-toolbar", children: _jsx(Input, { leadingIcon: _jsx(Search, { "aria-hidden": true }), placeholder: "Filter tables\u2026", value: query, onChange: (e) => setQuery(e.target.value), "aria-label": "Filter tables" }) }), _jsx(DataTable, { columns: columns, rows: filtered, rowKey: (t) => t.full_name, onRowClick: loadDetail, isRowSelected: (t) => selected?.full_name === t.full_name, loading: tables === null, emptyState: _jsx(Empty, { icon: _jsx(Search, { "aria-hidden": true, size: 20 }), title: "No tables match your filter", description: "Try a different search term or clear the filter." }) })] }), _jsx(Card, { children: loadingDetail ? (_jsxs(CardBody, { children: [_jsx(Skeleton, { shape: "line", width: "50%", height: 20 }), _jsx(Skeleton, { shape: "line", width: "80%" }), _jsx(Skeleton, { shape: "line", width: "70%" }), _jsx("div", { style: { marginTop: 24 }, children: _jsx(Skeleton, { shape: "block", height: 160 }) })] })) : selected ? (_jsxs(CardBody, { children: [_jsxs("div", { className: "catalog-detail-title", children: [_jsx(FileText, { size: 20, style: { color: "var(--brand-500)", flexShrink: 0 } }), _jsx("span", { className: "catalog-detail-fullpath", children: selected.name }), _jsx(CopyChip, { value: selected.full_name, display: selected.full_name, title: "Copy full UC path" }), _jsx(Badge, { tone: "info", square: true, children: selected.table_type })] }), selected.comment && _jsx("p", { className: "catalog-detail-desc", children: selected.comment }), _jsxs("div", { className: "catalog-cols-section", children: [_jsxs("div", { className: "catalog-cols-section-label", children: ["Columns \u00B7 ", selected.columns.length] }), _jsx(Card, { flush: true, children: _jsxs("table", { className: "data-table catalog-cols-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Type" }), _jsx("th", { children: "Comment" })] }) }), _jsx("tbody", { children: selected.columns.map((c) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { children: c.name }) }), _jsx("td", { children: _jsx("span", { className: "catalog-type-chip", children: c.type }) }), _jsx("td", { className: "catalog-col-comment", children: c.comment || _jsx("span", { style: { color: "var(--text-quaternary)" }, children: "\u2014" }) })] }, c.name))) })] }) })] })] })) : (_jsx(Empty, { icon: _jsx(Database, { "aria-hidden": true, size: 22 }), title: "Pick a table to inspect", description: "Select any silver table on the left to view its schema, comments, and column types." })) })] })] }));
}
