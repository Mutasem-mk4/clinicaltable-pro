/**
 * ClinicalTable Pro — Process API Route
 *
 * Proxies requests from the frontend to the Python FastAPI backend.
 * This route handles the file upload and passes it through.
 */

import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const action = formData.get("action") as string;

    let endpoint: string;

    switch (action) {
      case "upload-preview":
        endpoint = `${PYTHON_BACKEND_URL}/upload-preview`;
        break;
      case "process":
        endpoint = `${PYTHON_BACKEND_URL}/process`;
        break;
      case "psm":
        endpoint = `${PYTHON_BACKEND_URL}/psm`;
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Expected: upload-preview, process, or psm." },
          { status: 400 }
        );
    }

    // Forward the form data (minus our 'action' field) to the Python backend
    const backendFormData = new FormData();
    for (const [key, value] of formData.entries()) {
      if (key !== "action") {
        backendFormData.append(key, value);
      }
    }

    const backendResponse = await fetch(endpoint, {
      method: "POST",
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({
        detail: `Backend error (${backendResponse.status})`,
      }));
      return NextResponse.json(
        { error: errorData.detail || "Processing failed" },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    // Check if it's a connection error to the Python backend
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return NextResponse.json(
        {
          error:
            "Cannot reach the processing backend. Please ensure the Python server is running on port 8000.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
