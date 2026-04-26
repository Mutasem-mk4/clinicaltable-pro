# ClinicalTable Pro

**From raw data to journal-ready tables. In seconds.**

Upload your dataset. Get a publication-ready demographic table (Table 1) formatted for NEJM, JAMA, or any journal style. No SPSS. No formatting. No wasted hours.

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+ and pip
- (Optional) A [Gemini API key](https://aistudio.google.com/apikey) for AI column mapping

### 1. Clone and install frontend

```bash
cd clinicaltable-pro
npm install
```

### 2. Set up Python backend

```bash
cd python
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your values. The only required value for local development is:

```
PYTHON_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_PYTHON_BACKEND_URL=http://localhost:8000
```

### 4. Start the servers

**Terminal 1 — Python backend:**

```bash
cd python
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Next.js frontend:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   Next.js 14    │────▶│   FastAPI (Py)    │
│   (Frontend)    │     │   (Stats Engine)  │
│   Port 3000     │     │   Port 8000       │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
  Gemini 2.5 Flash       pandas + scipy
  (Column Mapping)       (Table Generation)
```

### Privacy Architecture

- Files are processed **ephemerally** — read into memory, computed, and discarded
- Raw data is **never written to disk or database**
- Only the formatted table result (JSON/HTML) is stored (if auth is configured)
- No logs of file content — only job metadata

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Python FastAPI |
| AI | Google Gemini 2.5 Flash |
| Stats | pandas, scipy, statsmodels |
| PDF Export | WeasyPrint |
| DOCX Export | python-docx |
| LaTeX Export | Jinja2 templates |
| Auth | Supabase (optional) |
| Payments | Lemon Squeezy (optional) |

---

## Project Structure

```
clinicaltable-pro/
├── app/
│   ├── layout.tsx              # Root layout, fonts, metadata
│   ├── page.tsx                # Landing page
│   ├── globals.css             # Design system
│   ├── app/
│   │   ├── page.tsx            # Main tool: upload → map → preview → download
│   │   └── history/
│   │       └── page.tsx        # Saved tables list
│   └── api/
│       └── process/
│           └── route.ts        # API route → proxies to Python backend
├── components/
│   ├── UploadZone.tsx          # Drag-and-drop file upload
│   ├── ColumnMapper.tsx        # AI-suggested column mapping
│   ├── TablePreview.tsx        # Journal-style HTML table
│   ├── ExportBar.tsx           # PDF / DOCX / LaTeX download buttons
│   └── PaymentGate.tsx         # Payment trigger
├── lib/
│   ├── gemini.ts               # Gemini API integration
│   ├── supabase.ts             # Supabase client
│   └── lemonsqueezy.ts         # Payment link generator
├── python/
│   ├── main.py                 # FastAPI app
│   ├── table_generator.py      # Core stats logic
│   ├── psm.py                  # Propensity Score Matching
│   ├── exporters/
│   │   ├── pdf.py              # WeasyPrint PDF export
│   │   ├── docx.py             # python-docx Word export
│   │   └── latex.py            # Jinja2 LaTeX export
│   └── requirements.txt
└── .env.example
```

---

## Statistical Methods

### Continuous Variables
- **Descriptive**: Mean ± SD, Median [IQR]
- **Normality**: Shapiro-Wilk test (n ≤ 5000)
- **Parametric**: Independent t-test (Welch's) if normal
- **Non-parametric**: Mann-Whitney U test if non-normal or n < 3
- **Multi-group**: Kruskal-Wallis test for >2 groups

### Categorical Variables
- **Descriptive**: n (%)
- **Expected count ≥ 5**: Chi-square test
- **Expected count < 5 (2×2)**: Fisher's exact test
- **Expected count < 5 (larger)**: Chi-square with warning

### Edge Cases Handled
- All null values → variable excluded with footnote
- Group with ≤1 member → descriptives only, p-value = N/A
- Shapiro-Wilk failure → fallback to Mann-Whitney
- Non-numeric values in continuous column → coerced with warning
- Missing values → pairwise exclusion, valid n reported

---

## Deployment

### Frontend (Vercel)

```bash
# Connect your repo to Vercel and set environment variables
vercel deploy
```

### Python Backend (Railway)

```bash
# railway.toml or use Railway dashboard
# Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `PYTHON_BACKEND_URL` in Vercel to your Railway URL.

---

## License

MIT
