import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="page-container">
      {/* ── Navigation ──────────────────────── */}
      <nav className="nav">
        <Link href="/" className="wordmark">
          <span className="wordmark__clinical">Clinical</span>
          <span className="wordmark__table">Table</span>
          <span className="wordmark__pro">Pro</span>
        </Link>
        <ul className="nav__links">
          <li>
            <Link href="/app" className="nav__link">
              Open tool
            </Link>
          </li>
        </ul>
      </nav>

      {/* ── Hero ────────────────────────────── */}
      <section className="hero">
        <h1 className="hero__headline">Your Table 1, done.</h1>
        <p className="hero__sub">
          Upload your dataset. Get a publication-ready demographic table in
          seconds — formatted for NEJM, JAMA, or any journal style. No SPSS.
          No formatting. No wasted hours.
        </p>
        <Link href="/app" className="btn btn--accent">
          Upload your data →
        </Link>
      </section>

      {/* ── Features — three lines, no cards ── */}
      <section className="features-text">
        <p className="features-text__item">
          Handles messy column names automatically.
        </p>
        <p className="features-text__item">Outputs PDF, Word, and LaTeX.</p>
        <p className="features-text__item">Your data is never stored.</p>
      </section>

      {/* ── How it works ────────────────────── */}
      <section className="section" style={{ borderTop: "1px solid var(--border-light)" }}>
        <h2 style={{ marginBottom: "1.5rem" }}>How it works</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>
              01
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Upload a CSV or Excel file with your patient data. Any column
              names — we&#39;ve seen them all.
            </p>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>
              02
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Our AI reads your columns and maps them to standard clinical
              variables. You confirm or adjust.
            </p>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>
              03
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Mean ± SD for continuous. n (%) for categorical. P-values via
              the right test. Footnotes auto-generated.
            </p>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>
              04
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Download as PDF, Word, or LaTeX. Copy-paste into your
              manuscript. Done.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────── */}
      <section className="pricing-section">
        <h2>Pricing</h2>
        <p>
          First table free. $4.99 per table after that, or $19/month
          unlimited.
        </p>
      </section>

      {/* ── Privacy banner ──────────────────── */}
      <section style={{ padding: "2rem 0" }}>
        <div className="banner banner--privacy">
          <span className="banner__icon">◆</span>
          <span>
            Your data never leaves your session. Files are processed in memory
            and immediately discarded. We never store, log, or access your raw
            data. Only the formatted table result is saved to your account.
          </span>
        </div>
      </section>

      {/* ── Footer ──────────────────────────── */}
      <footer className="footer">
        <p className="footer__text">
          © {new Date().getFullYear()} ClinicalTable Pro. Built for
          researchers, by researchers.
        </p>
      </footer>
    </div>
  );
}
