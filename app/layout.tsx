import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClinicalTable Pro — Publication-Ready Table 1 in Seconds",
  description:
    "Upload your dataset and get a journal-formatted demographic table instantly. Supports PDF, Word, and LaTeX export. Handles messy column names automatically. Your data is never stored.",
  keywords: [
    "Table 1",
    "clinical research",
    "demographics table",
    "biostatistics",
    "NEJM",
    "JAMA",
    "statistical table",
    "research tools",
  ],
  openGraph: {
    title: "ClinicalTable Pro",
    description: "From raw data to journal-ready tables. In seconds.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
