"use client";

import { useState, useCallback } from "react";

export interface ColumnMapping {
  original_name: string;
  mapped_name: string;
  variable_type: "continuous" | "categorical" | "id" | "group" | "skip";
  suggested_label: string;
}

interface ColumnMapperProps {
  mappings: ColumnMapping[];
  onConfirm: (confirmed: ColumnMapping[]) => void;
  onBack: () => void;
  isLoading: boolean;
}

const TYPE_OPTIONS: { value: ColumnMapping["variable_type"]; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "categorical", label: "Categorical" },
  { value: "group", label: "Group" },
  { value: "id", label: "ID" },
  { value: "skip", label: "Skip" },
];

export default function ColumnMapper({
  mappings,
  onConfirm,
  onBack,
  isLoading,
}: ColumnMapperProps) {
  const [editedMappings, setEditedMappings] = useState<ColumnMapping[]>(mappings);

  const updateMapping = useCallback(
    (index: number, field: keyof ColumnMapping, value: string) => {
      setEditedMappings((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    onConfirm(editedMappings);
  }, [editedMappings, onConfirm]);

  const activeVariables = editedMappings.filter(
    (m) => m.variable_type !== "skip" && m.variable_type !== "id"
  );
  const groupColumns = editedMappings.filter((m) => m.variable_type === "group");
  const hasGroup = groupColumns.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ marginBottom: "0.25rem" }}>Column mapping</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Review and adjust the AI-suggested variable types. Mark one column as &quot;Group&quot;
            to split the table.
          </p>
        </div>
      </div>

      {!hasGroup && (
        <div className="banner banner--info" style={{ marginBottom: "1.5rem" }}>
          <span className="banner__icon">i</span>
          <span>
            No group column selected. The table will show overall statistics only. To compare
            groups (e.g., Treatment vs. Control), set one column type to &quot;Group&quot;.
          </span>
        </div>
      )}

      {/* Mapping table */}
      <div style={{ overflowX: "auto" }}>
        <table className="journal-table" style={{ marginBottom: "1.5rem" }}>
          <thead>
            <tr>
              <th>Original column</th>
              <th>Label</th>
              <th>Type</th>
              <th style={{ width: "60px" }}></th>
            </tr>
          </thead>
          <tbody>
            {editedMappings.map((mapping, idx) => (
              <tr key={mapping.original_name}>
                <td>
                  <code className="mono" style={{ fontSize: "0.8125rem" }}>
                    {mapping.original_name}
                  </code>
                </td>
                <td>
                  <input
                    className="input"
                    type="text"
                    value={mapping.suggested_label}
                    onChange={(e) => updateMapping(idx, "suggested_label", e.target.value)}
                    style={{ maxWidth: "240px", padding: "0.25rem 0.5rem", fontSize: "0.8125rem" }}
                    aria-label={`Label for ${mapping.original_name}`}
                  />
                </td>
                <td>
                  <select
                    className="select"
                    value={mapping.variable_type}
                    onChange={(e) =>
                      updateMapping(idx, "variable_type", e.target.value)
                    }
                    style={{ maxWidth: "160px", padding: "0.25rem 2rem 0.25rem 0.5rem", fontSize: "0.8125rem" }}
                    aria-label={`Type for ${mapping.original_name}`}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span
                    className={`mapper-type-tag mapper-type-tag--${mapping.variable_type}`}
                  >
                    {mapping.variable_type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "1.5rem" }}>
        {activeVariables.length} variable{activeVariables.length !== 1 ? "s" : ""} selected
        {hasGroup && (
          <>
            {" · "}Grouped by{" "}
            <code className="mono">{groupColumns[0].original_name}</code>
          </>
        )}
      </p>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button className="btn btn--ghost" onClick={onBack} disabled={isLoading} type="button">
          ← Back
        </button>
        <button
          className="btn btn--accent"
          onClick={handleConfirm}
          disabled={isLoading || activeVariables.length === 0}
          type="button"
        >
          {isLoading ? (
            <>
              <span className="spinner" /> Generating table…
            </>
          ) : (
            "Generate Table 1 →"
          )}
        </button>
      </div>
    </div>
  );
}
