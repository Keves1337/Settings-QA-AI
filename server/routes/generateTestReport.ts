import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

function generateSTRReport(data: any): string {
  const { testRunId, testCase, result, duration, timestamp } = data;
  return `═══════════════════════════════════════════════════════════
        STANDARD TEST REPORT (STR)
═══════════════════════════════════════════════════════════

Report ID: ${testRunId}
Generated: ${new Date(timestamp).toISOString()}
Test Execution Duration: ${duration}ms

───────────────────────────────────────────────────────────
TEST CASE INFORMATION
───────────────────────────────────────────────────────────

Title: ${testCase.title}
Description: ${testCase.description}
Priority: ${testCase.priority}
Phase: ${testCase.phase}
Automated: ${testCase.automated ? "Yes" : "No"}

───────────────────────────────────────────────────────────
TEST EXECUTION STEPS
───────────────────────────────────────────────────────────

${testCase.steps?.map((step: string, idx: number) => `${idx + 1}. ${step}`).join("\n")}

───────────────────────────────────────────────────────────
EXPECTED RESULT
───────────────────────────────────────────────────────────

${testCase.expected_result}

───────────────────────────────────────────────────────────
ACTUAL RESULT
───────────────────────────────────────────────────────────

Status: ${result.status.toUpperCase()}
${result.result}

───────────────────────────────────────────────────────────
TEST METRICS
───────────────────────────────────────────────────────────

Execution Time: ${duration}ms
Pass/Fail: ${result.status === "passed" ? "PASSED" : "FAILED"}
Timestamp: ${new Date(timestamp).toLocaleString()}

═══════════════════════════════════════════════════════════
        END OF STANDARD TEST REPORT
═══════════════════════════════════════════════════════════
`;
}

export async function generateTestReport(req: Request, res: Response) {
  const { testRunId, testCase, result, duration, timestamp } = req.body;

  if (!testRunId || !testCase || !result) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const reportContent = generateSTRReport({ testRunId, testCase, result, duration, timestamp });
  const fileName = `test-report-${testRunId}-${Date.now()}.str`;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.json({ success: true, reportContent, fileName, reportUrl: null });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const filePath = `reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("test-reports")
      .upload(filePath, reportContent, { contentType: "text/plain", upsert: false });

    if (uploadError) {
      return res.json({ success: true, reportContent, fileName, reportUrl: null });
    }

    const { data: urlData } = supabase.storage.from("test-reports").getPublicUrl(filePath);
    await supabase.from("test_runs").update({ report_url: urlData.publicUrl }).eq("id", testRunId);

    return res.json({ success: true, reportUrl: urlData.publicUrl, fileName });
  } catch (error: any) {
    console.error("Error generating report:", error);
    return res.json({ success: true, reportContent, fileName, reportUrl: null });
  }
}
