"use client";

import { useCallback, useState, useRef, type DragEvent, type ChangeEvent } from "react";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  error: string | null;
}

const ACCEPTED_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/tab-separated-values",
];

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".tsv"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function validateFile(file: File): string | null {
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Unsupported file type "${ext}". Please upload a CSV or Excel file.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`;
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  return null;
}

export default function UploadZone({ onFileSelected, isLoading, error }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayError = error || localError;

  const handleFile = useCallback(
    (file: File) => {
      setLocalError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      setFileName(file.name);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.click();
    }
  }, [isLoading]);

  const zoneClass = [
    "upload-zone",
    isDragOver ? "upload-zone--active" : "",
    displayError ? "upload-zone--error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div
        className={zoneClass}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Upload CSV or Excel file"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleChange}
          disabled={isLoading}
          style={{ display: "none" }}
          aria-hidden="true"
        />

        {isLoading ? (
          <div className="processing">
            <div className="spinner spinner--large" />
            <p className="processing__text">Reading file…</p>
          </div>
        ) : fileName ? (
          <p className="upload-zone__text">
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
              {fileName}
            </span>
            <br />
            <span style={{ fontSize: "0.8125rem" }}>
              Drop a different file or <span>click to replace</span>
            </span>
          </p>
        ) : (
          <p className="upload-zone__text">
            Drop your CSV or Excel file here, or <span>browse</span>
          </p>
        )}
      </div>

      {displayError && (
        <div className="banner banner--error" style={{ marginTop: "0.75rem" }}>
          <span className="banner__icon">✕</span>
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
