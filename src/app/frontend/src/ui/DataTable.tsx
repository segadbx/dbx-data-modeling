import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, idx: number) => ReactNode;
  width?: string | number;
  align?: "left" | "right" | "center";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowSelected,
  className,
  emptyState,
  loading = false,
  skeletonRows = 6,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, idx: number) => string;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  className?: string;
  emptyState?: ReactNode;
  loading?: boolean;
  skeletonRows?: number;
}) {
  return (
    <div className={["data-table-shell", className ?? ""].join(" ")}>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    width: c.width,
                    textAlign: c.align ?? "left",
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        <span className="skeleton skeleton-line" style={{ width: "70%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0
              ? null
              : rows.map((row, i) => {
                  const selected = isRowSelected?.(row) ?? false;
                  return (
                    <tr
                      key={rowKey(row, i)}
                      className={
                        [
                          selected ? "is-selected" : "",
                          onRowClick ? "is-clickable" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          style={{ textAlign: c.align ?? "left" }}
                        >
                          {c.render(row, i)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && emptyState && (
          <div className="data-table-empty">{emptyState}</div>
        )}
      </div>
    </div>
  );
}
