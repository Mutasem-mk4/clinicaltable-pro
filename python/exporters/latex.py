"""
ClinicalTable Pro — LaTeX Export (Jinja2)

Generates a LaTeX document for Table 1 using booktabs-style formatting.
"""

from __future__ import annotations

from typing import Any

from jinja2 import Template


LATEX_TEMPLATE = r"""
\documentclass[11pt]{article}
\usepackage[a4paper, landscape, margin=2.5cm]{geometry}
\usepackage{booktabs}
\usepackage{array}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}

\begin{document}

\begin{table}[htbp]
\centering
\caption{ {{- title -}}. Baseline Characteristics of Study Participants}
\label{tab:baseline}

\begin{tabular}{ {{- col_spec -}} }
\toprule
{% for col in columns %}{{ col }}{% if not loop.last %} & {% endif %}{% endfor %} \\
\midrule
{% for row in rows %}
{%- if row.type == 'category_header' %}\textit{\textbf{ {{- row.variable -}} }}{% elif row.type == 'category_value' %}\quad {{ row.variable | trim }}{% else %}{{ row.variable }}{% endif %} & {% for val in row.cell_values %}{{ val }}{% if not loop.last %} & {% endif %}{% endfor %} \\
{% endfor %}
\bottomrule
\end{tabular}

{% if footnotes %}
\vspace{4pt}
\footnotesize
{% for note in footnotes %}
\textit{ {{- note -}} } \\
{% endfor %}
{% endif %}

\end{table}

\end{document}
"""


def _escape_latex(text: str) -> str:
    """Escape special LaTeX characters."""
    replacements = {
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
        "±": r"$\pm$",
        "≤": r"$\leq$",
        "≥": r"$\geq$",
        "<": r"$<$",
        ">": r"$>$",
        "–": "--",
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def export_latex(table_data: dict[str, Any], title: str = "Table 1") -> str:
    """
    Generate LaTeX string from table data.

    Parameters
    ----------
    table_data : dict
        Output from generate_table_one().
    title : str
        Table title/number.

    Returns
    -------
    str : LaTeX document content.
    """

    columns = table_data["columns"]
    rows = table_data["rows"]
    footnotes = table_data.get("footnotes", []) + table_data.get("stats_method_notes", [])

    # Column specification: left-aligned first col, centered rest
    col_spec = "l" + "c" * (len(columns) - 1)

    # Escape column headers
    escaped_columns = [_escape_latex(str(c)) for c in columns]

    # Process rows
    processed_rows = []
    for row in rows:
        variable = row.get("variable", "")
        values = row.get("values", {})
        row_type = row.get("type", "")

        cell_values = []
        for col in columns[1:]:
            if col == "P-value":
                val = str(values.get("p_value", ""))
            else:
                group_name = col.split(" (n=")[0] if " (n=" in col else col.split(" (N=")[0]
                val = str(values.get(group_name, values.get(col, "")))
            cell_values.append(_escape_latex(val))

        processed_rows.append({
            "variable": _escape_latex(variable),
            "cell_values": cell_values,
            "type": row_type,
        })

    # Escape footnotes
    escaped_footnotes = [_escape_latex(n) for n in footnotes]

    # Render template
    template = Template(LATEX_TEMPLATE)
    result = template.render(
        title=_escape_latex(title),
        col_spec=col_spec,
        columns=escaped_columns,
        rows=processed_rows,
        footnotes=escaped_footnotes,
    )

    return result
