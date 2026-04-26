/**
 * ClinicalTable Pro — Gemini AI Column Mapping
 *
 * Sends column names + sample data to Gemini 2.5 Flash and gets back
 * intelligent variable type classifications.
 */

import type { ColumnMapping } from "@/components/ColumnMapper";

const GEMINI_PROMPT = `You are a clinical biostatistician with 20 years of experience reading messy research datasets.

Given these CSV column names and sample values, map each column to its standard clinical meaning.

For each column return a JSON object with:
- "original_name": the exact column name as given
- "mapped_name": a clean, standardized variable name (e.g., "age", "sex", "bmi")
- "variable_type": one of "continuous", "categorical", "id", "group", or "skip"
  - "continuous" = numeric measurements (age, BMI, lab values, scores)
  - "categorical" = categories with limited levels (sex, diagnosis, treatment arm, yes/no)
  - "id" = patient/subject identifier
  - "group" = treatment/control group indicator (binary or few levels representing comparison groups)
  - "skip" = irrelevant columns (timestamps, notes, file paths)
- "suggested_label": a publication-ready label (e.g., "Age, years", "Body mass index, kg/m²", "Sex, n (%)")

Rules:
- If a column has only 2-3 unique values and looks like a treatment/exposure variable, mark it as "group"
- Age, BMI, lab values, scores → "continuous"
- Sex, race, smoking status, yes/no fields → "categorical"
- Patient_ID, Subject_No, Record_ID → "id"
- Be smart about messy abbreviations: "pt_age" = Age, "dx" = Diagnosis, "htn" = Hypertension
- Return ONLY a valid JSON array. No markdown, no explanation.`;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Call Gemini 2.5 Flash to map columns to clinical variable types.
 *
 * @param apiKey - Gemini API key
 * @param columnNames - Array of column names from the uploaded file
 * @param sampleRows - First 5 rows as array of objects
 * @returns Parsed column mappings
 */
export async function mapColumnsWithGemini(
  apiKey: string,
  columnNames: string[],
  sampleRows: Record<string, unknown>[],
): Promise<ColumnMapping[]> {
  if (!apiKey) {
    throw new Error("Gemini API key is required for column mapping.");
  }

  // Build the data summary to send to Gemini
  const dataSummary = `Column names: ${JSON.stringify(columnNames)}

Sample data (first ${sampleRows.length} rows):
${JSON.stringify(sampleRows, null, 2)}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          { text: dataSummary },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error("Gemini API rate limit reached. Please wait a moment and try again.");
    }
    if (response.status === 403) {
      throw new Error("Invalid Gemini API key. Please check your key and try again.");
    }
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data: GeminiResponse = await response.json();

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response. Please try again.");
  }

  // Parse the JSON response
  let parsed: ColumnMapping[];
  try {
    // Clean potential markdown code fences
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      "Failed to parse Gemini response as JSON. The AI returned an unexpected format."
    );
  }

  // Validate structure
  if (!Array.isArray(parsed)) {
    throw new Error("Gemini returned invalid data structure (expected array).");
  }

  // Ensure all original columns are present and fill in any missing
  const mappedOriginals = new Set(parsed.map((m) => m.original_name));
  for (const col of columnNames) {
    if (!mappedOriginals.has(col)) {
      parsed.push({
        original_name: col,
        mapped_name: col.toLowerCase().replace(/\s+/g, "_"),
        variable_type: "skip",
        suggested_label: col,
      });
    }
  }

  // Validate each mapping has required fields
  return parsed.map((m) => ({
    original_name: m.original_name || "",
    mapped_name: m.mapped_name || m.original_name || "",
    variable_type: (["continuous", "categorical", "id", "group", "skip"].includes(
      m.variable_type
    )
      ? m.variable_type
      : "skip") as ColumnMapping["variable_type"],
    suggested_label: m.suggested_label || m.mapped_name || m.original_name || "",
  }));
}

/**
 * Fallback: heuristic column mapping when no API key is available.
 * Uses data types and value patterns to guess variable types.
 */
export function mapColumnsHeuristic(
  columnNames: string[],
  sampleRows: Record<string, unknown>[],
): ColumnMapping[] {
  return columnNames.map((col) => {
    const colLower = col.toLowerCase();
    const values = sampleRows.map((r) => r[col]).filter((v) => v != null);

    // Check for ID patterns
    if (
      colLower.includes("id") ||
      colLower.includes("subject") ||
      colLower.includes("patient") ||
      colLower.includes("record")
    ) {
      return {
        original_name: col,
        mapped_name: "id",
        variable_type: "id" as const,
        suggested_label: "Subject ID",
      };
    }

    // Check for group patterns
    if (
      colLower.includes("group") ||
      colLower.includes("arm") ||
      colLower.includes("treatment") ||
      colLower.includes("control") ||
      colLower.includes("cohort")
    ) {
      return {
        original_name: col,
        mapped_name: colLower.replace(/\s+/g, "_"),
        variable_type: "group" as const,
        suggested_label: col,
      };
    }

    // Check if values are numeric
    const numericValues = values.filter((v) => !isNaN(Number(v)));
    const isNumeric = numericValues.length > values.length * 0.7;

    // Count unique values
    const uniqueValues = new Set(values.map(String));
    const nUnique = uniqueValues.size;

    // Binary/few categories with non-numeric → categorical
    if (nUnique <= 10 && !isNumeric) {
      return {
        original_name: col,
        mapped_name: colLower.replace(/\s+/g, "_"),
        variable_type: "categorical" as const,
        suggested_label: col,
      };
    }

    // Numeric → continuous
    if (isNumeric) {
      return {
        original_name: col,
        mapped_name: colLower.replace(/\s+/g, "_"),
        variable_type: "continuous" as const,
        suggested_label: col,
      };
    }

    // Default: skip
    return {
      original_name: col,
      mapped_name: colLower.replace(/\s+/g, "_"),
      variable_type: "skip" as const,
      suggested_label: col,
    };
  });
}
