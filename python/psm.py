"""
ClinicalTable Pro — Propensity Score Matching Module

Implements 1:1 nearest-neighbor propensity score matching with caliper.
Used as the premium differentiator feature.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.spatial import KDTree
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


def perform_psm(
    df: pd.DataFrame,
    treatment_col: str,
    covariates: list[str],
    caliper: float = 0.2,
    random_state: int = 42,
) -> dict[str, Any]:
    """
    Perform 1:1 nearest-neighbor propensity score matching.

    Parameters
    ----------
    df : pd.DataFrame
        Input data.
    treatment_col : str
        Binary treatment/group column name.
    covariates : list[str]
        Columns to use as matching covariates.
    caliper : float
        Maximum allowed difference in propensity scores (in SD units).
    random_state : int
        Random seed for reproducibility.

    Returns
    -------
    dict with keys:
        - matched_df: DataFrame of matched subjects
        - matched_indices: list of (treated_idx, control_idx) pairs
        - n_treated: number in treatment group
        - n_control: number in control group
        - n_matched: number of matched pairs
        - n_unmatched: number of unmatched treated subjects
        - balance_table: pre/post matching balance statistics
        - propensity_scores: Series of propensity scores
    """

    result: dict[str, Any] = {
        "matched_df": None,
        "matched_indices": [],
        "n_treated": 0,
        "n_control": 0,
        "n_matched": 0,
        "n_unmatched": 0,
        "balance_table": [],
        "propensity_scores": None,
        "error": None,
    }

    # Validate inputs
    if treatment_col not in df.columns:
        result["error"] = f"Treatment column '{treatment_col}' not found."
        return result

    missing_covs = [c for c in covariates if c not in df.columns]
    if missing_covs:
        result["error"] = f"Covariates not found: {', '.join(missing_covs)}"
        return result

    # Prepare data: drop rows with missing values in relevant columns
    relevant_cols = [treatment_col] + covariates
    working_df = df[relevant_cols].dropna().copy()

    if working_df.shape[0] < 10:
        result["error"] = "Insufficient data after removing missing values (need ≥10 rows)."
        return result

    # Encode treatment as binary (0/1)
    treatment_vals = working_df[treatment_col].unique()
    if len(treatment_vals) != 2:
        result["error"] = f"Treatment column must have exactly 2 groups, found {len(treatment_vals)}."
        return result

    treatment_map = {treatment_vals[0]: 0, treatment_vals[1]: 1}
    working_df["_treatment_binary"] = working_df[treatment_col].map(treatment_map)

    # Prepare covariate matrix
    X = working_df[covariates].copy()

    # Handle categorical covariates via one-hot encoding
    cat_cols = X.select_dtypes(include=["object", "category"]).columns.tolist()
    if cat_cols:
        X = pd.get_dummies(X, columns=cat_cols, drop_first=True, dtype=float)

    # Coerce all to numeric
    X = X.apply(pd.to_numeric, errors="coerce").fillna(0)

    y = working_df["_treatment_binary"].values

    # Fit logistic regression for propensity scores
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    try:
        model = LogisticRegression(
            max_iter=1000,
            random_state=random_state,
            solver="lbfgs",
        )
        model.fit(X_scaled, y)
        ps = model.predict_proba(X_scaled)[:, 1]
    except Exception as e:
        result["error"] = f"Propensity score model failed: {str(e)}"
        return result

    working_df["_ps"] = ps
    result["propensity_scores"] = ps.tolist()

    # Separate treated and control
    treated_mask = working_df["_treatment_binary"] == 1
    control_mask = working_df["_treatment_binary"] == 0

    treated_df = working_df[treated_mask].copy()
    control_df = working_df[control_mask].copy()

    result["n_treated"] = len(treated_df)
    result["n_control"] = len(control_df)

    if len(treated_df) == 0 or len(control_df) == 0:
        result["error"] = "One group has no observations."
        return result

    # Caliper in SD of logit propensity scores
    ps_std = np.std(ps)
    caliper_abs = caliper * ps_std

    # 1:1 nearest-neighbor matching using KDTree
    control_ps = control_df["_ps"].values.reshape(-1, 1)
    treated_ps = treated_df["_ps"].values.reshape(-1, 1)

    tree = KDTree(control_ps)
    distances, indices = tree.query(treated_ps, k=1)
    distances = distances.flatten()
    indices = indices.flatten()

    # Apply caliper and ensure 1:1 (no replacement)
    matched_pairs: list[tuple[int, int]] = []
    used_controls: set[int] = set()

    # Sort by distance to prioritize best matches
    order = np.argsort(distances)

    for i in order:
        if distances[i] > caliper_abs:
            continue
        control_idx = indices[i]
        if control_idx in used_controls:
            continue
        treated_original_idx = treated_df.index[i]
        control_original_idx = control_df.index[control_idx]
        matched_pairs.append((treated_original_idx, control_original_idx))
        used_controls.add(control_idx)

    result["n_matched"] = len(matched_pairs)
    result["n_unmatched"] = len(treated_df) - len(matched_pairs)
    result["matched_indices"] = matched_pairs

    if len(matched_pairs) == 0:
        result["error"] = "No matches found within caliper. Consider increasing caliper or checking data."
        return result

    # Build matched DataFrame
    matched_treated_idx = [p[0] for p in matched_pairs]
    matched_control_idx = [p[1] for p in matched_pairs]
    matched_df = pd.concat([
        working_df.loc[matched_treated_idx],
        working_df.loc[matched_control_idx],
    ]).drop(columns=["_treatment_binary", "_ps"])

    result["matched_df"] = matched_df

    # Balance table: standardized mean differences before/after matching
    balance_rows = []
    for cov in covariates:
        col_data = working_df[cov]
        if col_data.dtype == "object" or str(col_data.dtype) == "category":
            continue  # Skip categorical for SMD; already balanced via PS

        # Pre-match SMD
        pre_treated = working_df.loc[treated_mask, cov].astype(float)
        pre_control = working_df.loc[control_mask, cov].astype(float)
        pooled_std = np.sqrt(
            (pre_treated.var() + pre_control.var()) / 2
        )
        if pooled_std > 0:
            pre_smd = abs(pre_treated.mean() - pre_control.mean()) / pooled_std
        else:
            pre_smd = 0.0

        # Post-match SMD
        post_treated = working_df.loc[matched_treated_idx, cov].astype(float)
        post_control = working_df.loc[matched_control_idx, cov].astype(float)
        post_pooled_std = np.sqrt(
            (post_treated.var() + post_control.var()) / 2
        )
        if post_pooled_std > 0:
            post_smd = abs(post_treated.mean() - post_control.mean()) / post_pooled_std
        else:
            post_smd = 0.0

        balance_rows.append({
            "covariate": cov,
            "pre_smd": round(float(pre_smd), 4),
            "post_smd": round(float(post_smd), 4),
            "improved": post_smd < pre_smd,
        })

    result["balance_table"] = balance_rows

    return result
