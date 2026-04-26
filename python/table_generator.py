"""
ClinicalTable Pro — Core Statistical Table Generator

Accepts a DataFrame, a grouping column, and variable definitions.
Produces a structured JSON result formatted for journal-style Table 1.

Edge cases handled:
  - All null values → variable skipped with footnote
  - Group with ≤1 member → descriptives only, p-value = N/A
  - Shapiro-Wilk failure → fallback to Mann-Whitney
  - Expected cell count <5 → Fisher's exact test
  - Non-numeric in continuous column → coerce with NaN, warn
  - Missing values → pairwise exclusion, valid n reported
"""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

warnings.filterwarnings("ignore", category=RuntimeWarning)


# ─── Type definitions ───────────────────────────────────────────────────────

class VariableSpec:
    """Describes a single variable to include in Table 1."""

    def __init__(self, name: str, var_type: str, label: str | None = None):
        self.name = name
        # 'continuous' or 'categorical'
        self.var_type = var_type.lower().strip()
        self.label = label or name

    def to_dict(self) -> dict:
        return {"name": self.name, "var_type": self.var_type, "label": self.label}


# ─── Helper: safe numeric coercion ──────────────────────────────────────────

def _safe_to_numeric(series: pd.Series) -> tuple[pd.Series, int]:
    """Coerce a series to numeric. Returns (coerced_series, n_failed)."""
    original_count = series.dropna().shape[0]
    coerced = pd.to_numeric(series, errors="coerce")
    coerced_count = coerced.dropna().shape[0]
    n_failed = original_count - coerced_count
    return coerced, n_failed


# ─── Helper: format numbers ────────────────────────────────────────────────

def _fmt(value: float | None, decimals: int = 1) -> str:
    """Format a float to string with given decimal places, or '—' if None/NaN."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "—"
    return f"{value:.{decimals}f}"


def _fmt_pvalue(p: float | None) -> str:
    """Format p-value for publication: <0.001, or 3 decimal places."""
    if p is None or (isinstance(p, float) and np.isnan(p)):
        return "—"
    if p < 0.001:
        return "<0.001"
    return f"{p:.3f}"


# ─── Continuous variable statistics ────────────────────────────────────────

def _compute_continuous(
    df: pd.DataFrame,
    var_name: str,
    group_col: str | None,
    groups: list[str] | None,
) -> dict[str, Any]:
    """Compute mean ± SD, median [IQR], and p-value for a continuous variable."""

    result: dict[str, Any] = {
        "cells": {},
        "p_value": None,
        "test_used": None,
        "warning": None,
    }

    series, n_failed = _safe_to_numeric(df[var_name])
    if n_failed > 0:
        result["warning"] = f"{n_failed} non-numeric values coerced to missing"

    if series.dropna().shape[0] == 0:
        # All null — skip entirely
        result["warning"] = "All values missing; variable excluded"
        return result

    if group_col is None or groups is None:
        # No grouping — overall statistics only
        valid = series.dropna()
        n = len(valid)
        result["cells"]["Overall"] = {
            "n": n,
            "mean_sd": f"{_fmt(valid.mean())} ± {_fmt(valid.std())}",
            "median_iqr": f"{_fmt(valid.median())} [{_fmt(valid.quantile(0.25))}–{_fmt(valid.quantile(0.75))}]",
        }
        return result

    # Per-group statistics
    group_data: dict[str, pd.Series] = {}
    for g in groups:
        g_series = series[df[group_col] == g].dropna()
        n = len(g_series)
        if n == 0:
            result["cells"][str(g)] = {
                "n": 0,
                "mean_sd": "—",
                "median_iqr": "—",
            }
        else:
            mean = g_series.mean()
            sd = g_series.std() if n > 1 else 0.0
            median = g_series.median()
            q25 = g_series.quantile(0.25)
            q75 = g_series.quantile(0.75)
            result["cells"][str(g)] = {
                "n": n,
                "mean_sd": f"{_fmt(mean)} ± {_fmt(sd)}",
                "median_iqr": f"{_fmt(median)} [{_fmt(q25)}–{_fmt(q75)}]",
            }
            group_data[str(g)] = g_series

    # P-value: requires exactly 2 groups with enough data
    valid_groups = [g for g in group_data if len(group_data[g]) >= 2]
    if len(valid_groups) == 2:
        a = group_data[valid_groups[0]]
        b = group_data[valid_groups[1]]

        # Normality test (Shapiro-Wilk) — use if n >= 3 and n <= 5000
        use_parametric = True
        for arr in [a, b]:
            n_arr = len(arr)
            if n_arr < 3 or n_arr > 5000:
                use_parametric = False
                break
            # Constant values → Shapiro-Wilk will fail
            if arr.std() == 0:
                use_parametric = False
                break
            try:
                _, p_shapiro = sp_stats.shapiro(arr)
                if p_shapiro < 0.05:
                    use_parametric = False
                    break
            except Exception:
                use_parametric = False
                break

        try:
            if use_parametric:
                _, p_val = sp_stats.ttest_ind(a, b, equal_var=False)
                result["test_used"] = "Independent t-test (Welch's)"
            else:
                _, p_val = sp_stats.mannwhitneyu(a, b, alternative="two-sided")
                result["test_used"] = "Mann-Whitney U test"
            result["p_value"] = float(p_val) if not np.isnan(p_val) else None
        except Exception:
            result["p_value"] = None
            result["test_used"] = "Test failed"
    elif len(valid_groups) > 2:
        # Kruskal-Wallis for >2 groups
        try:
            arrays = [group_data[g].values for g in valid_groups]
            _, p_val = sp_stats.kruskal(*arrays)
            result["p_value"] = float(p_val) if not np.isnan(p_val) else None
            result["test_used"] = "Kruskal-Wallis test"
        except Exception:
            result["p_value"] = None
            result["test_used"] = "Test failed"
    else:
        result["p_value"] = None
        result["test_used"] = "N/A (insufficient groups)"

    return result


# ─── Categorical variable statistics ──────────────────────────────────────

def _compute_categorical(
    df: pd.DataFrame,
    var_name: str,
    group_col: str | None,
    groups: list[str] | None,
) -> dict[str, Any]:
    """Compute n (%) and p-value for a categorical variable."""

    result: dict[str, Any] = {
        "categories": [],
        "cells": {},
        "p_value": None,
        "test_used": None,
        "warning": None,
    }

    series = df[var_name].copy()

    if series.dropna().shape[0] == 0:
        result["warning"] = "All values missing; variable excluded"
        return result

    # Get unique categories (excluding NaN)
    categories = sorted(series.dropna().unique(), key=str)
    result["categories"] = [str(c) for c in categories]

    if group_col is None or groups is None:
        # Overall only
        total_valid = series.dropna().shape[0]
        overall_cells: dict[str, dict] = {}
        for cat in categories:
            n_cat = int((series == cat).sum())
            pct = (n_cat / total_valid * 100) if total_valid > 0 else 0.0
            overall_cells[str(cat)] = {
                "Overall": f"{n_cat} ({_fmt(pct)}%)",
            }
        result["cells"] = overall_cells
        return result

    # Per-group counts
    cat_cells: dict[str, dict[str, str]] = {}
    contingency_data: list[list[int]] = []

    for cat in categories:
        cat_cells[str(cat)] = {}
        row: list[int] = []
        for g in groups:
            g_series = series[df[group_col] == g]
            total_g = g_series.dropna().shape[0]
            n_cat = int((g_series == cat).sum())
            pct = (n_cat / total_g * 100) if total_g > 0 else 0.0
            cat_cells[str(cat)][str(g)] = f"{n_cat} ({_fmt(pct)}%)"
            row.append(n_cat)
        contingency_data.append(row)

    result["cells"] = cat_cells

    # P-value: chi-square or Fisher's exact
    if len(groups) >= 2 and len(categories) >= 2:
        contingency = np.array(contingency_data)

        # Check expected cell counts for chi-square validity
        try:
            row_sums = contingency.sum(axis=1, keepdims=True)
            col_sums = contingency.sum(axis=0, keepdims=True)
            total = contingency.sum()

            if total == 0:
                result["p_value"] = None
                result["test_used"] = "N/A (no observations)"
            else:
                expected = row_sums * col_sums / total
                min_expected = expected.min()

                # 2x2 table with small expected → Fisher's exact
                if contingency.shape == (2, 2) and min_expected < 5:
                    _, p_val = sp_stats.fisher_exact(contingency)
                    result["test_used"] = "Fisher's exact test"
                    result["p_value"] = float(p_val) if not np.isnan(p_val) else None
                elif min_expected < 5:
                    # Non-2x2 with small expected counts
                    # Use chi-square with warning
                    chi2, p_val, _, _ = sp_stats.chi2_contingency(contingency)
                    result["test_used"] = "Chi-square test†"
                    result["warning"] = "Expected cell count <5; interpret with caution"
                    result["p_value"] = float(p_val) if not np.isnan(p_val) else None
                else:
                    chi2, p_val, _, _ = sp_stats.chi2_contingency(contingency)
                    result["test_used"] = "Chi-square test"
                    result["p_value"] = float(p_val) if not np.isnan(p_val) else None
        except Exception:
            result["p_value"] = None
            result["test_used"] = "Test failed"
    else:
        result["p_value"] = None
        result["test_used"] = "N/A (insufficient data)"

    return result


# ─── Main Table Generator ──────────────────────────────────────────────────

def generate_table_one(
    df: pd.DataFrame,
    group_col: str | None,
    variables: list[dict[str, str]],
) -> dict[str, Any]:
    """
    Generate a Table 1 from a DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        The input data.
    group_col : str or None
        Column name to group by (e.g., 'treatment_group'). None for overall.
    variables : list of dict
        Each dict has keys: 'name', 'type' ('continuous'|'categorical'), 'label' (optional).

    Returns
    -------
    dict with keys: columns, rows, footnotes, stats_method_notes, warnings
    """

    # Validate input
    if df.empty:
        return {
            "columns": [],
            "rows": [],
            "footnotes": [],
            "stats_method_notes": [],
            "warnings": ["Input data is empty."],
        }

    # Parse variable specs
    var_specs: list[VariableSpec] = []
    for v in variables:
        vtype = v.get("type", v.get("var_type", "continuous"))
        label = v.get("label", v.get("suggested_label", v["name"]))
        var_specs.append(VariableSpec(name=v["name"], var_type=vtype, label=label))

    # Determine groups
    groups: list[str] | None = None
    if group_col and group_col in df.columns:
        groups = sorted(df[group_col].dropna().unique(), key=str)
        groups = [str(g) for g in groups]
    else:
        group_col = None

    # Build column headers
    columns: list[str] = ["Variable"]
    if groups:
        for g in groups:
            n_g = (df[group_col] == g).sum()
            columns.append(f"{g} (n={n_g})")
        columns.append("P-value")
    else:
        n_total = len(df)
        columns.append(f"Overall (N={n_total})")

    # Process each variable
    rows: list[dict[str, Any]] = []
    footnotes: list[str] = []
    stat_notes: list[str] = []
    all_warnings: list[str] = []
    tests_used: set[str] = set()

    for spec in var_specs:
        if spec.name not in df.columns:
            all_warnings.append(f"Column '{spec.name}' not found in data; skipped.")
            continue

        if spec.var_type == "continuous":
            result = _compute_continuous(df, spec.name, group_col, groups)

            if result.get("warning") and "excluded" in result["warning"].lower():
                all_warnings.append(f"{spec.label}: {result['warning']}")
                continue

            # Build row
            row: dict[str, Any] = {
                "variable": spec.label,
                "type": "continuous",
                "values": {},
            }

            if groups:
                for g in groups:
                    cell = result["cells"].get(str(g), {})
                    row["values"][str(g)] = cell.get("mean_sd", "—")
                row["values"]["p_value"] = _fmt_pvalue(result.get("p_value"))
            else:
                cell = result["cells"].get("Overall", {})
                row["values"]["Overall"] = cell.get("mean_sd", "—")

            if result.get("test_used"):
                tests_used.add(result["test_used"])

            if result.get("warning"):
                all_warnings.append(f"{spec.label}: {result['warning']}")

            rows.append(row)

        elif spec.var_type == "categorical":
            result = _compute_categorical(df, spec.name, group_col, groups)

            if result.get("warning") and "excluded" in result["warning"].lower():
                all_warnings.append(f"{spec.label}: {result['warning']}")
                continue

            # Category header row
            header_row: dict[str, Any] = {
                "variable": spec.label,
                "type": "category_header",
                "values": {},
            }

            if groups:
                for g in groups:
                    header_row["values"][str(g)] = ""
                header_row["values"]["p_value"] = _fmt_pvalue(result.get("p_value"))
            else:
                header_row["values"]["Overall"] = ""

            rows.append(header_row)

            # Individual category rows
            for cat in result.get("categories", []):
                cat_row: dict[str, Any] = {
                    "variable": f"  {cat}",
                    "type": "category_value",
                    "values": {},
                }

                if groups:
                    cat_data = result["cells"].get(str(cat), {})
                    for g in groups:
                        cat_row["values"][str(g)] = cat_data.get(str(g), "—")
                    cat_row["values"]["p_value"] = ""
                else:
                    cat_data = result["cells"].get(str(cat), {})
                    cat_row["values"]["Overall"] = cat_data.get("Overall", "—")

                rows.append(cat_row)

            if result.get("test_used"):
                tests_used.add(result["test_used"])

            if result.get("warning") and "excluded" not in result["warning"].lower():
                all_warnings.append(f"{spec.label}: {result['warning']}")

    # Generate footnotes
    footnotes.append(
        "Values are mean ± SD for continuous variables and n (%) for categorical variables."
    )

    # Build method notes from tests actually used
    test_descriptions = []
    if "Independent t-test (Welch's)" in tests_used:
        test_descriptions.append("independent t-test (Welch's)")
    if "Mann-Whitney U test" in tests_used:
        test_descriptions.append("Mann-Whitney U test")
    if "Kruskal-Wallis test" in tests_used:
        test_descriptions.append("Kruskal-Wallis test")
    if "Chi-square test" in tests_used or "Chi-square test†" in tests_used:
        test_descriptions.append("chi-square test")
    if "Fisher's exact test" in tests_used:
        test_descriptions.append("Fisher's exact test")

    if test_descriptions:
        joined = ", ".join(test_descriptions[:-1])
        if len(test_descriptions) > 1:
            joined += f", or {test_descriptions[-1]}"
        else:
            joined = test_descriptions[0]
        stat_notes.append(
            f"P-values calculated using {joined} as appropriate."
        )

    if "Chi-square test†" in tests_used:
        footnotes.append(
            "† Expected cell count <5 in one or more cells; results should be interpreted with caution."
        )

    return {
        "columns": columns,
        "rows": rows,
        "footnotes": footnotes,
        "stats_method_notes": stat_notes,
        "warnings": all_warnings,
    }
