"""
ClinicalTable Pro — FastAPI Backend

Endpoints:
  POST /process       — Upload CSV/Excel + variable config → Table 1 JSON
  POST /export/pdf    — Generate PDF from table JSON
  POST /export/docx   — Generate DOCX from table JSON
  POST /export/latex   — Generate LaTeX from table JSON
  POST /psm           — Run Propensity Score Matching
  GET  /health        — Health check

Privacy: All file processing is ephemeral. Files are read into memory,
processed, and discarded. Nothing is written to disk or database.
"""

from __future__ import annotations

import io
import json
import traceback
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse

from table_generator import generate_table_one
from psm import perform_psm
from exporters.pdf import export_pdf
from exporters.docx import export_docx
from exporters.latex import export_latex

app = FastAPI(
    title="ClinicalTable Pro API",
    version="1.0.0",
    description="Ephemeral clinical table generation engine.",
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _read_file_to_df(file: UploadFile) -> pd.DataFrame:
    """Read an uploaded CSV or Excel file into a DataFrame. Ephemeral — memory only."""

    content = file.file.read()
    filename = file.filename or ""

    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    elif filename.endswith(".csv"):
        # Try common encodings
        for encoding in ["utf-8", "latin-1", "cp1252"]:
            try:
                df = pd.read_csv(io.BytesIO(content), encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not decode CSV file. Please ensure it is UTF-8 encoded.")
    elif filename.endswith(".tsv"):
        df = pd.read_csv(io.BytesIO(content), sep="\t")
    else:
        # Try CSV as default
        df = pd.read_csv(io.BytesIO(content))

    if df.empty:
        raise ValueError("Uploaded file is empty.")

    if df.shape[1] < 2:
        raise ValueError("File must contain at least 2 columns.")

    return df


def _get_preview(df: pd.DataFrame, n_rows: int = 5) -> dict[str, Any]:
    """Get first N rows and column info for preview/mapping."""
    preview_df = df.head(n_rows)
    columns_info = []
    for col in df.columns:
        col_data = df[col]
        dtype = str(col_data.dtype)
        n_unique = col_data.nunique()
        n_missing = int(col_data.isna().sum())
        sample_values = [str(v) for v in preview_df[col].dropna().head(3).tolist()]

        columns_info.append({
            "name": col,
            "dtype": dtype,
            "n_unique": n_unique,
            "n_missing": n_missing,
            "n_total": len(df),
            "sample_values": sample_values,
        })

    return {
        "n_rows": len(df),
        "n_cols": len(df.columns),
        "columns": columns_info,
        "preview_rows": json.loads(preview_df.to_json(orient="records")),
    }


# ─── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "ClinicalTable Pro API"}


@app.post("/upload-preview")
async def upload_preview(file: UploadFile = File(...)):
    """
    Upload a file and return a preview + column metadata.
    Used by the frontend before the AI column mapping step.
    """
    try:
        df = _read_file_to_df(file)
        preview = _get_preview(df)
        return JSONResponse(content=preview)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")


@app.post("/process")
async def process_table(
    file: UploadFile = File(...),
    group_col: str = Form(None),
    variables: str = Form(...),
):
    """
    Process uploaded file and generate Table 1.

    Parameters (multipart form):
        file: CSV or Excel file
        group_col: Column name for grouping (or null for overall)
        variables: JSON string of variable definitions
                   [{"name": "age", "type": "continuous", "label": "Age, years"}, ...]
    """
    try:
        df = _read_file_to_df(file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

    # Parse variable definitions
    try:
        var_list = json.loads(variables)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in 'variables' field.")

    if not var_list:
        raise HTTPException(status_code=400, detail="No variables specified for table generation.")

    # Validate group_col
    if group_col and group_col not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Group column '{group_col}' not found in data. Available columns: {list(df.columns)}",
        )

    # Generate table
    try:
        result = generate_table_one(
            df=df,
            group_col=group_col if group_col else None,
            variables=var_list,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Table generation failed: {str(e)}",
        )

    return JSONResponse(content=result)


@app.post("/export/pdf")
async def export_pdf_endpoint(
    table_data: str = Form(...),
    title: str = Form("Table 1"),
):
    """Generate and return PDF from table data JSON."""
    try:
        data = json.loads(table_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in 'table_data'.")

    try:
        pdf_bytes = export_pdf(data, title)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{title}.pdf"'},
    )


@app.post("/export/docx")
async def export_docx_endpoint(
    table_data: str = Form(...),
    title: str = Form("Table 1"),
):
    """Generate and return DOCX from table data JSON."""
    try:
        data = json.loads(table_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in 'table_data'.")

    try:
        docx_bytes = export_docx(data, title)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"DOCX generation failed: {str(e)}")

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{title}.docx"'},
    )


@app.post("/export/latex")
async def export_latex_endpoint(
    table_data: str = Form(...),
    title: str = Form("Table 1"),
):
    """Generate and return LaTeX source from table data JSON."""
    try:
        data = json.loads(table_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in 'table_data'.")

    try:
        latex_str = export_latex(data, title)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LaTeX generation failed: {str(e)}")

    return Response(
        content=latex_str.encode("utf-8"),
        media_type="application/x-tex",
        headers={"Content-Disposition": f'attachment; filename="{title}.tex"'},
    )


@app.post("/psm")
async def psm_endpoint(
    file: UploadFile = File(...),
    treatment_col: str = Form(...),
    covariates: str = Form(...),
    caliper: float = Form(0.2),
    variables: str = Form(...),
    group_col: str = Form(None),
):
    """
    Run PSM then regenerate Table 1 on the matched dataset.

    Parameters:
        file: CSV/Excel file
        treatment_col: Binary treatment column
        covariates: JSON array of covariate column names
        caliper: Matching caliper (SD units, default 0.2)
        variables: JSON array of variable definitions for Table 1
        group_col: Group column for Table 1 (usually same as treatment_col)
    """
    try:
        df = _read_file_to_df(file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        cov_list = json.loads(covariates)
        var_list = json.loads(variables)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in request fields.")

    # Run PSM
    try:
        psm_result = perform_psm(
            df=df,
            treatment_col=treatment_col,
            covariates=cov_list,
            caliper=caliper,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PSM failed: {str(e)}")

    if psm_result.get("error"):
        raise HTTPException(status_code=400, detail=psm_result["error"])

    # Generate Table 1 on matched data
    matched_df = psm_result.get("matched_df")
    if matched_df is None or matched_df.empty:
        raise HTTPException(status_code=400, detail="PSM produced no matched data.")

    try:
        gc = group_col if group_col else treatment_col
        table_result = generate_table_one(
            df=matched_df,
            group_col=gc,
            variables=var_list,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Table generation on matched data failed: {str(e)}")

    return JSONResponse(content={
        "table": table_result,
        "psm_summary": {
            "n_treated": psm_result["n_treated"],
            "n_control": psm_result["n_control"],
            "n_matched": psm_result["n_matched"],
            "n_unmatched": psm_result["n_unmatched"],
            "balance_table": psm_result["balance_table"],
        },
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
