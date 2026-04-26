"use client";

import { useState, useCallback } from "react";

interface TableData {
  columns: string[];
  rows: Array<{
    variable: string;
    type: string;
    values: Record<string, string>;
  }>;
  footnotes: string[];
  stats_method_notes: string[];
  warnings: string[];
}

interface ExportBarProps {
  tableData: TableData;
  backendUrl: string;
}

type ExportFormat = "pdf" | "docx" | "latex";

export default function ExportBar({ tableData, backendUrl }: ExportBarProps) {
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setLoadingFormat(format);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("table_data", JSON.stringify(tableData));
        formData.append("title", "Table 1");
        formData.append("action", `export-${format}`);

        const response = await fetch(`/api/process`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.detail || `Export failed with status ${response.status}`
          );
        }

        // Get the blob and trigger download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const extensions: Record<ExportFormat, string> = {
          pdf: ".pdf",
          docx: ".docx",
          latex: ".tex",
        };
        a.download = `Table_1${extensions[format]}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed";
        setError(message);
      } finally {
        setLoadingFormat(null);
      }
    },
    [tableData, backendUrl]
  );

  return (
    <div>
      <div className="export-bar">
        <span className="export-bar__label">Export as</span>

        <button
          className="btn btn--small"
          onClick={() => handleExport("pdf")}
          disabled={loadingFormat !== null}
          type="button"
        >
          {loadingFormat === "pdf" ? (
            <><span className="spinner" /> PDF</>
          ) : (
            "PDF"
          )}
        </button>

        <button
          className="btn btn--small"
          onClick={() => handleExport("docx")}
          disabled={loadingFormat !== null}
          type="button"
        >
          {loadingFormat === "docx" ? (
            <><span className="spinner" /> Word</>
          ) : (
            "Word (.docx)"
          )}
        </button>

        <button
          className="btn btn--small"
          onClick={() => handleExport("latex")}
          disabled={loadingFormat !== null}
          type="button"
        >
          {loadingFormat === "latex" ? (
            <><span className="spinner" /> LaTeX</>
          ) : (
            "LaTeX"
          )}
        </button>
      </div>

      {error && (
        <div className="banner banner--error" style={{ marginTop: "0.5rem" }}>
          <span className="banner__icon">✕</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
