import { useEffect, useMemo, useState } from "react";
import { Database, FileText, Search, TableIcon } from "lucide-react";
import { describeTable, listTables, type Table, type TableDetail } from "../api/client";
import { PageHeader } from "../ui/PageHeader";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { Empty } from "../ui/Empty";
import { Input } from "../ui/Input";
import { Card, CardBody } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { Badge } from "../ui/Badge";
import { CopyChip } from "../ui/CopyChip";
import { useToast } from "../ui/Toast";

export default function Catalog() {
  const [tables, setTables] = useState<Table[] | null>(null);
  const [selected, setSelected] = useState<TableDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    listTables()
      .then(setTables)
      .catch((e) => toast({ tone: "danger", title: "Failed to load catalog", description: String(e) }));
  }, [toast]);

  const filtered = useMemo(() => {
    if (!tables) return [];
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter(
      (t) => t.name.toLowerCase().includes(q) || t.comment?.toLowerCase().includes(q),
    );
  }, [tables, query]);

  function loadDetail(t: Table) {
    setLoadingDetail(true);
    describeTable(t.name)
      .then((d) => setSelected(d))
      .catch((e) => toast({ tone: "danger", title: "Failed to load table", description: String(e) }))
      .finally(() => setLoadingDetail(false));
  }

  const columns: DataTableColumn<Table>[] = [
    {
      key: "name",
      header: "Table",
      render: (t) => (
        <span className="catalog-table-name">
          <TableIcon
            size={14}
            style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--text-quaternary)" }}
          />
          {t.name}
        </span>
      ),
    },
    {
      key: "comment",
      header: "Description",
      render: (t) => (
        <span className="catalog-table-comment" title={t.comment}>
          {t.comment || <span style={{ color: "var(--text-quaternary)" }}>—</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            <Database size={12} /> Unity Catalog
          </>
        }
        title="Silver catalog"
        description="Cleaned, conformed source tables ready for dimensional modeling. Click a table to inspect its schema."
        actions={
          <Badge tone="neutral" icon={<Database size={12} />}>
            {tables ? `${tables.length} tables` : "loading…"}
          </Badge>
        }
      />

      <div className="two-pane two-pane-narrow-left">
        <Card flush>
          <div className="catalog-list-toolbar">
            <Input
              leadingIcon={<Search aria-hidden />}
              placeholder="Filter tables…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter tables"
            />
          </div>
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(t) => t.full_name}
            onRowClick={loadDetail}
            isRowSelected={(t) => selected?.full_name === t.full_name}
            loading={tables === null}
            emptyState={
              <Empty
                icon={<Search aria-hidden size={20} />}
                title="No tables match your filter"
                description="Try a different search term or clear the filter."
              />
            }
          />
        </Card>

        <Card>
          {loadingDetail ? (
            <CardBody>
              <Skeleton shape="line" width="50%" height={20} />
              <Skeleton shape="line" width="80%" />
              <Skeleton shape="line" width="70%" />
              <div style={{ marginTop: 24 }}>
                <Skeleton shape="block" height={160} />
              </div>
            </CardBody>
          ) : selected ? (
            <CardBody>
              <div className="catalog-detail-title">
                <FileText
                  size={20}
                  style={{ color: "var(--brand-500)", flexShrink: 0 }}
                />
                <span className="catalog-detail-fullpath">{selected.name}</span>
                <CopyChip
                  value={selected.full_name}
                  display={selected.full_name}
                  title="Copy full UC path"
                />
                <Badge tone="info" square>
                  {selected.table_type}
                </Badge>
              </div>
              {selected.comment && <p className="catalog-detail-desc">{selected.comment}</p>}

              <div className="catalog-cols-section">
                <div className="catalog-cols-section-label">
                  Columns · {selected.columns.length}
                </div>
                <Card flush>
                  <table className="data-table catalog-cols-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.columns.map((c) => (
                        <tr key={c.name}>
                          <td>
                            <code>{c.name}</code>
                          </td>
                          <td>
                            <span className="catalog-type-chip">{c.type}</span>
                          </td>
                          <td className="catalog-col-comment">
                            {c.comment || <span style={{ color: "var(--text-quaternary)" }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </CardBody>
          ) : (
            <Empty
              icon={<Database aria-hidden size={22} />}
              title="Pick a table to inspect"
              description="Select any silver table on the left to view its schema, comments, and column types."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
