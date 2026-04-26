"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * Saved tables history page.
 * Requires Supabase auth (week 2 feature).
 * Currently shows a placeholder with the table structure.
 */

interface SavedTable {
  id: string;
  file_name: string;
  n_rows: number;
  n_variables: number;
  group_column: string | null;
  created_at: string;
}

export default function HistoryPage() {
  const [tables, setTables] = useState<SavedTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // In production: check Supabase auth and fetch history
    // For now, show the unauthenticated state
    setIsLoading(false);
    setIsAuthenticated(false);
  }, []);

  return (
    <div className="page-container">
      {/* ── Nav ───────────────────────────────── */}
      <nav className="nav">
        <Link href="/" className="wordmark">
          <span className="wordmark__clinical">Clinical</span>
          <span className="wordmark__table">Table</span>
          <span className="wordmark__pro">Pro</span>
        </Link>
        <ul className="nav__links">
          <li>
            <Link href="/app" className="nav__link">
              New table
            </Link>
          </li>
          <li>
            <Link href="/app/history" className="nav__link" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              History
            </Link>
          </li>
        </ul>
      </nav>

      <section className="section">
        <h2 style={{ marginBottom: "1.5rem" }}>Saved tables</h2>

        {isLoading ? (
          <div className="processing">
            <div className="spinner spinner--large" />
            <p className="processing__text">Loading your tables…</p>
          </div>
        ) : !isAuthenticated ? (
          <div>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Sign in to save and access your generated tables.
            </p>
            <button className="btn btn--accent" type="button">
              Sign in with magic link
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.75rem" }}>
              We&apos;ll send a sign-in link to your email. No password needed.
            </p>
          </div>
        ) : tables.length === 0 ? (
          <div>
            <p style={{ color: "var(--text-secondary)" }}>
              No saved tables yet.{" "}
              <Link href="/app" style={{ color: "var(--accent)" }}>
                Generate your first table →
              </Link>
            </p>
          </div>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Rows</th>
                <th>Variables</th>
                <th>Group</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                    {t.file_name}
                  </td>
                  <td>{t.n_rows}</td>
                  <td>{t.n_variables}</td>
                  <td>
                    {t.group_column ? (
                      <code className="mono">{t.group_column}</code>
                    ) : (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button className="btn btn--small btn--ghost" type="button">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="footer">
        <p className="footer__text">
          © {new Date().getFullYear()} ClinicalTable Pro
        </p>
      </footer>
    </div>
  );
}
