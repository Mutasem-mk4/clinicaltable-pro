/**
 * ClinicalTable Pro — Supabase Client
 *
 * Initializes the Supabase client for auth and database operations.
 * Used for: user authentication, saved tables history, job metadata.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "ClinicalTable Pro: Supabase credentials not configured. Auth and history features will be unavailable."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Save a generated table to the user's history.
 * Stores only the result JSON — never the raw uploaded data.
 */
export async function saveTableResult(
  userId: string,
  tableData: Record<string, unknown>,
  metadata: {
    fileName: string;
    nRows: number;
    nVariables: number;
    groupColumn: string | null;
  }
): Promise<{ id: string } | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const { data, error } = await supabase
    .from("table_results")
    .insert({
      user_id: userId,
      table_json: tableData,
      file_name: metadata.fileName,
      n_rows: metadata.nRows,
      n_variables: metadata.nVariables,
      group_column: metadata.groupColumn,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save table result:", error.message);
    return null;
  }

  return data;
}

/**
 * Fetch the user's table history.
 */
export async function getTableHistory(userId: string) {
  if (!supabaseUrl || !supabaseAnonKey) return [];

  const { data, error } = await supabase
    .from("table_results")
    .select("id, file_name, n_rows, n_variables, group_column, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to fetch table history:", error.message);
    return [];
  }

  return data || [];
}

/**
 * Fetch a single saved table result.
 */
export async function getTableResult(tableId: string, userId: string) {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const { data, error } = await supabase
    .from("table_results")
    .select("*")
    .eq("id", tableId)
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Failed to fetch table result:", error.message);
    return null;
  }

  return data;
}
