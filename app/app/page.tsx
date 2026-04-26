"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import UploadZone from "@/components/UploadZone";
import ColumnMapper, { type ColumnMapping } from "@/components/ColumnMapper";
import TablePreview from "@/components/TablePreview";
import ExportBar from "@/components/ExportBar";
import PaymentGate from "@/components/PaymentGate";
import { mapColumnsWithGemini, mapColumnsHeuristic } from "@/lib/gemini";

// ─── Types ─────────────────────────────────────────────────────────────────

type Step = "upload" | "mapping" | "processing" | "preview";

interface PreviewData {
  n_rows: number;
  n_cols: number;
  columns: Array<{
    name: string;
    dtype: string;
    n_unique: number;
    n_missing: number;
    n_total: number;
    sample_values: string[];
  }>;
  preview_rows: Record<string, unknown>[];
}

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

// ─── Configuration ─────────────────────────────────────────────────────────

const PYTHON_BACKEND_URL =
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || "http://localhost:8000";

// ─── Main App Page ─────────────────────────────────────────────────────────

export default function AppPage() {
  // Workflow state
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [tableData, setTableData] = useState<TableData | null>(null);

  // Loading & error states
  const [uploadLoading, setUploadLoading] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [processLoading, setProcessLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  // Payment state (simplified — tracks tables used in session)
  const [tablesUsed, setTablesUsed] = useState(0);

  // Gemini API key (stored in browser session)
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("gemini_api_key") || "";
    }
    return "";
  });

  // ── Step 1: File Upload ────────────────────────────────────────────────

  const handleFileSelected = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setUploadLoading(true);
      setUploadError(null);
      setMappingError(null);
      setProcessError(null);

      try {
        // Upload to Python backend for preview
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await fetch(`${PYTHON_BACKEND_URL}/upload-preview`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.detail || `Upload failed (${response.status})`
          );
        }

        const preview: PreviewData = await response.json();
        setPreviewData(preview);

        // Now do column mapping with Gemini (or heuristic fallback)
        const columnNames = preview.columns.map((c) => c.name);
        const sampleRows = preview.preview_rows;

        let columnMappings: ColumnMapping[];

        if (geminiKey) {
          try {
            columnMappings = await mapColumnsWithGemini(
              geminiKey,
              columnNames,
              sampleRows
            );
          } catch (geminiError) {
            console.warn("Gemini mapping failed, using heuristic:", geminiError);
            columnMappings = mapColumnsHeuristic(columnNames, sampleRows);
            setMappingError(
              `AI mapping unavailable: ${geminiError instanceof Error ? geminiError.message : "Unknown error"}. Using heuristic mapping — please review carefully.`
            );
          }
        } else {
          columnMappings = mapColumnsHeuristic(columnNames, sampleRows);
        }

        setMappings(columnMappings);
        setStep("mapping");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to process file";
        setUploadError(message);
      } finally {
        setUploadLoading(false);
      }
    },
    [geminiKey]
  );

  // ── Step 2: Confirm Mapping & Generate Table ──────────────────────────

  const handleMappingConfirm = useCallback(
    async (confirmed: ColumnMapping[]) => {
      if (!file) return;

      setProcessLoading(true);
      setProcessError(null);
      setStep("processing");

      try {
        // Find group column
        const groupMapping = confirmed.find((m) => m.variable_type === "group");
        const groupCol = groupMapping?.original_name || null;

        // Build variable list (exclude id, skip, group)
        const variables = confirmed
          .filter(
            (m) =>
              m.variable_type === "continuous" ||
              m.variable_type === "categorical"
          )
          .map((m) => ({
            name: m.original_name,
            type: m.variable_type,
            label: m.suggested_label,
          }));

        if (variables.length === 0) {
          throw new Error(
            "No variables selected for the table. Please mark at least one column as Continuous or Categorical."
          );
        }

        // Send to Python backend
        const formData = new FormData();
        formData.append("file", file);
        formData.append("variables", JSON.stringify(variables));
        if (groupCol) {
          formData.append("group_col", groupCol);
        }

        const response = await fetch(`${PYTHON_BACKEND_URL}/process`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.detail || `Processing failed (${response.status})`
          );
        }

        const result: TableData = await response.json();
        setTableData(result);
        setTablesUsed((prev) => prev + 1);
        setStep("preview");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Table generation failed";
        setProcessError(message);
        setStep("mapping");
      } finally {
        setProcessLoading(false);
      }
    },
    [file]
  );

  // ── Navigation ────────────────────────────────────────────────────────

  const handleBackToUpload = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPreviewData(null);
    setMappings([]);
    setTableData(null);
    setUploadError(null);
    setMappingError(null);
    setProcessError(null);
  }, []);

  const handleBackToMapping = useCallback(() => {
    setStep("mapping");
    setProcessError(null);
  }, []);

  const handleNewTable = useCallback(() => {
    handleBackToUpload();
  }, [handleBackToUpload]);

  // ── Payment Handlers ─────────────────────────────────────────────────

  const handlePurchase = useCallback(() => {
    // In production: redirect to Lemon Squeezy checkout
    alert(
      "Payment integration placeholder. Configure LEMON_SQUEEZY_API_KEY and variant IDs in .env.local"
    );
  }, []);

  const handleSubscribe = useCallback(() => {
    alert(
      "Subscription integration placeholder. Configure LEMON_SQUEEZY_API_KEY and variant IDs in .env.local"
    );
  }, []);

  // ── Gemini Key Handler ───────────────────────────────────────────────

  const handleGeminiKeyChange = useCallback((key: string) => {
    setGeminiKey(key);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("gemini_api_key", key);
    }
  }, []);

  // ── Step Indicator ───────────────────────────────────────────────────

  const steps = [
    { label: "Upload", key: "upload" },
    { label: "Map columns", key: "mapping" },
    { label: "Preview & export", key: "preview" },
  ];

  const stepOrder = ["upload", "mapping", "processing", "preview"];
  const currentStepIndex = stepOrder.indexOf(step);

  return (
    <div className="page-container page-container--wide">
      {/* ── Nav ───────────────────────────────── */}
      <nav className="nav">
        <Link href="/" className="wordmark">
          <span className="wordmark__clinical">Clinical</span>
          <span className="wordmark__table">Table</span>
          <span className="wordmark__pro">Pro</span>
        </Link>
        <ul className="nav__links">
          <li>
            <button
              className="nav__link"
              onClick={handleNewTable}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              type="button"
            >
              New table
            </button>
          </li>
        </ul>
      </nav>

      {/* ── Step Indicator ────────────────────── */}
      <div className="steps">
        {steps.map((s, i) => {
          const stepIndex = stepOrder.indexOf(s.key);
          const isActive = s.key === step || (step === "processing" && s.key === "mapping");
          const isDone = currentStepIndex > stepIndex;

          return (
            <div
              key={s.key}
              className={`step ${isActive ? "step--active" : ""} ${isDone ? "step--done" : ""}`}
            >
              <span className="step__number">
                {isDone ? "✓" : i + 1}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>

      {/* ── Privacy Banner (always visible) ───── */}
      <div className="banner banner--privacy" style={{ marginBottom: "2rem" }}>
        <span className="banner__icon">◆</span>
        <span>Your data is never stored. Files are processed in memory and immediately discarded.</span>
      </div>

      {/* ── Gemini API Key Input ──────────────── */}
      {step === "upload" && (
        <div className="field" style={{ marginBottom: "2rem" }}>
          <label className="label" htmlFor="gemini-key">
            Gemini API key <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional — enables AI column mapping)</span>
          </label>
          <input
            id="gemini-key"
            className="input"
            type="password"
            placeholder="AIza..."
            value={geminiKey}
            onChange={(e) => handleGeminiKeyChange(e.target.value)}
            style={{ maxWidth: "400px" }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
            Get a free key at{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              aistudio.google.com/apikey
            </a>
            . Without a key, heuristic mapping is used.
          </p>
        </div>
      )}

      {/* ── Step 1: Upload ────────────────────── */}
      {step === "upload" && (
        <div>
          <h2 style={{ marginBottom: "1rem" }}>Upload your dataset</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            CSV or Excel file with patient/subject data. Column headers in the first row.
          </p>
          <UploadZone
            onFileSelected={handleFileSelected}
            isLoading={uploadLoading}
            error={uploadError}
          />
          {previewData && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginTop: "1rem" }}>
              {previewData.n_rows} rows × {previewData.n_cols} columns detected
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: Column Mapping ────────────── */}
      {step === "mapping" && (
        <div>
          {mappingError && (
            <div className="banner banner--error" style={{ marginBottom: "1rem" }}>
              <span className="banner__icon">!</span>
              <span>{mappingError}</span>
            </div>
          )}
          {processError && (
            <div className="banner banner--error" style={{ marginBottom: "1rem" }}>
              <span className="banner__icon">✕</span>
              <span>{processError}</span>
            </div>
          )}
          <ColumnMapper
            mappings={mappings}
            onConfirm={handleMappingConfirm}
            onBack={handleBackToUpload}
            isLoading={processLoading}
          />
        </div>
      )}

      {/* ── Step 2.5: Processing ──────────────── */}
      {step === "processing" && (
        <div className="processing" style={{ padding: "4rem 0" }}>
          <div className="spinner spinner--large" />
          <p className="processing__text">
            Computing statistics and generating your table…
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
            Calculating means, standard deviations, p-values, and formatting output.
          </p>
        </div>
      )}

      {/* ── Step 3: Table Preview & Export ─────── */}
      {step === "preview" && tableData && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2>Your table is ready</h2>
            <button className="btn btn--ghost btn--small" onClick={handleNewTable} type="button">
              + New table
            </button>
          </div>

          {/* Payment Gate */}
          <PaymentGate
            tablesUsed={tablesUsed}
            freeLimit={1}
            onPurchase={handlePurchase}
            onSubscribe={handleSubscribe}
          />

          {/* The Table */}
          <TablePreview data={tableData} />

          {/* Export Bar */}
          <ExportBar tableData={tableData} backendUrl={PYTHON_BACKEND_URL} />

          {/* Back to mapping */}
          <div style={{ marginTop: "1.5rem" }}>
            <button
              className="btn btn--ghost btn--small"
              onClick={handleBackToMapping}
              type="button"
            >
              ← Adjust column mapping
            </button>
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────── */}
      <footer className="footer">
        <p className="footer__text">
          © {new Date().getFullYear()} ClinicalTable Pro
        </p>
      </footer>
    </div>
  );
}
