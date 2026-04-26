"use client";

interface TableRow {
  variable: string;
  type: string;
  values: Record<string, string>;
}

interface TableData {
  columns: string[];
  rows: TableRow[];
  footnotes: string[];
  stats_method_notes: string[];
  warnings: string[];
}

interface TablePreviewProps {
  data: TableData;
  title?: string;
}

export default function TablePreview({ data, title = "Table 1" }: TablePreviewProps) {
  const { columns, rows, footnotes, stats_method_notes, warnings } = data;

  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return (
      <div className="banner banner--info">
        <span className="banner__icon">i</span>
        <span>No table data to display.</span>
      </div>
    );
  }

  return (
    <div>
      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="banner banner--error" style={{ marginBottom: "1rem" }}>
          <span className="banner__icon">!</span>
          <div>
            {warnings.map((w, i) => (
              <p key={i} style={{ margin: 0, fontSize: "0.8125rem" }}>
                {w}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* The table */}
      <div className="journal-table-wrapper">
        <table className="journal-table" id="table-preview">
          <caption>
            {title}. Baseline Characteristics of Study Participants
          </caption>

          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={col === "P-value" ? "col-pvalue" : ""}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => {
              const isCategoryHeader = row.type === "category_header";
              const isCategoryValue = row.type === "category_value";

              return (
                <tr
                  key={`${row.variable}-${rowIdx}`}
                  className={isCategoryHeader ? "category-row" : ""}
                >
                  {columns.map((col, colIdx) => {
                    if (colIdx === 0) {
                      // Variable name column
                      return (
                        <td
                          key={col}
                          className={isCategoryValue ? "indent" : ""}
                          style={isCategoryHeader ? { fontWeight: 600, fontStyle: "italic" } : undefined}
                        >
                          {isCategoryValue ? row.variable.trim() : row.variable}
                        </td>
                      );
                    }

                    // Data columns
                    let value = "";
                    if (col === "P-value") {
                      value = row.values?.p_value ?? "";
                    } else {
                      // Extract group name from "Group (n=X)" format
                      const groupName = col.includes(" (n=")
                        ? col.split(" (n=")[0]
                        : col.includes(" (N=")
                          ? col.split(" (N=")[0]
                          : col;
                      value = row.values?.[groupName] ?? row.values?.[col] ?? "";
                    }

                    return (
                      <td
                        key={col}
                        className={`mono-cell ${col === "P-value" ? "col-pvalue" : ""}`}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {/* Footnotes */}
          {(footnotes.length > 0 || stats_method_notes.length > 0) && (
            <tfoot>
              <tr>
                <td colSpan={columns.length}>
                  {[...footnotes, ...stats_method_notes].map((note, i) => (
                    <span key={i}>
                      {note}
                      {i < footnotes.length + stats_method_notes.length - 1 && <br />}
                    </span>
                  ))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
