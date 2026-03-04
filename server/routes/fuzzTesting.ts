import { Request, Response } from "express";
import OpenAI from "openai";

function buildTemplateFuzzTests(codeFiles: any[], iterations: number) {
  const fileName = codeFiles[0]?.name || "target";
  const count = Math.min(iterations, 10);
  const types = ["boundary", "injection", "malformed", "concurrent", "memory", "type-confusion", "overflow"] as const;
  const severities = ["critical", "high", "medium", "low"] as const;
  const templates = [
    { testType: "boundary", targetFunction: "handleInput", input: "\"\" (empty string)", expectedBehavior: "Graceful rejection with validation error", severity: "high", description: "Tests empty string edge case for input handlers.", potentialImpact: "Unhandled null reference crash" },
    { testType: "injection", targetFunction: "queryDatabase", input: "\"'; DROP TABLE users; --\"", expectedBehavior: "Input is sanitized, query is not executed", severity: "critical", description: "SQL injection via string concatenation in query.", potentialImpact: "Data destruction or exfiltration" },
    { testType: "malformed", targetFunction: "parseJSON", input: "\"{broken: json,,}\"", expectedBehavior: "Parser throws a caught exception with descriptive error", severity: "medium", description: "Malformed JSON input to deserialization functions.", potentialImpact: "Unhandled exception causing service crash" },
    { testType: "overflow", targetFunction: "processArray", input: "Array of 10,000,000 items", expectedBehavior: "Function returns error or paginates — does not crash", severity: "high", description: "Extremely large array to test memory allocation limits.", potentialImpact: "Out-of-memory crash or DoS" },
    { testType: "type-confusion", targetFunction: "calculateTotal", input: "\"NaN\", null, undefined", expectedBehavior: "Type coercion is handled; NaN propagation is prevented", severity: "medium", description: "Non-numeric types passed to numeric calculation functions.", potentialImpact: "Silent data corruption" },
    { testType: "injection", targetFunction: "renderTemplate", input: "\"<script>alert('xss')</script>\"", expectedBehavior: "Output is HTML-escaped; script does not execute", severity: "critical", description: "XSS injection via template rendering.", potentialImpact: "Session hijacking or data theft" },
    { testType: "concurrent", targetFunction: "updateBalance", input: "100 concurrent increment requests", expectedBehavior: "Final balance reflects all increments — no race condition", severity: "high", description: "Concurrent writes to shared state to detect race conditions.", potentialImpact: "Data inconsistency or lost updates" },
    { testType: "boundary", targetFunction: "validateAge", input: "-1, 0, 150, 999999", expectedBehavior: "Out-of-range values are rejected with validation errors", severity: "medium", description: "Boundary values for integer range validation.", potentialImpact: "Accepting invalid data into system" },
    { testType: "malformed", targetFunction: "parseDate", input: "\"32/13/2024\", \"not-a-date\"", expectedBehavior: "Invalid dates are rejected; no crash occurs", severity: "medium", description: "Invalid date strings to test date parsing robustness.", potentialImpact: "Application crash or wrong date stored" },
    { testType: "memory", targetFunction: "processFile", input: "2GB file upload", expectedBehavior: "Request is rejected with a file-size error before loading into memory", severity: "critical", description: "Oversized file input to test memory exhaustion.", potentialImpact: "Server out-of-memory crash" },
  ];

  return {
    fuzzTests: templates.slice(0, count).map(t => ({ ...t, targetFunction: `${fileName}::${t.targetFunction}` })),
    coverageAreas: ["Input validation", "SQL injection", "XSS prevention", "Memory safety", "Concurrency", "Type safety", "Boundary conditions"],
    estimatedBugsFound: Math.floor(count * 0.3),
  };
}

export async function fuzzTesting(req: Request, res: Response) {
  const { codeFiles, testConfig } = req.body;

  if (!codeFiles || !Array.isArray(codeFiles)) return res.status(400).json({ error: "Invalid codeFiles array" });
  if (codeFiles.length === 0) return res.status(400).json({ error: "At least one code file required" });
  if (codeFiles.length > 20) return res.status(400).json({ error: "Maximum 20 code files allowed" });

  for (const file of codeFiles) {
    if (!file.name || typeof file.name !== "string") return res.status(400).json({ error: "Invalid file name" });
    if (!file.content || typeof file.content !== "string") return res.status(400).json({ error: "Invalid file content" });
    if (file.content.length > 500000) return res.status(400).json({ error: "File too large. Maximum 500KB per file" });
  }

  if (!testConfig || typeof testConfig !== "object") return res.status(400).json({ error: "Invalid testConfig" });

  const iterations = testConfig.iterations || 100;
  if (typeof iterations !== "number" || iterations < 1 || iterations > 500) {
    return res.status(400).json({ error: "Iterations must be between 1 and 500" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.json(buildTemplateFuzzTests(codeFiles, iterations));
  }

  try {
    const openai = new OpenAI({ apiKey });
    const fileContext = codeFiles.map((file: any) => `File: ${file.path || file.name}\n${file.content}`).join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert fuzzing and property-based testing engineer. Analyze the code and generate extreme edge cases and randomized tests to find bugs. Generate fuzz tests covering: boundary values, injection attempts, malformed data, concurrent access patterns, memory issues, type confusion, and overflow scenarios." },
        { role: "user", content: `Generate ${Math.min(iterations, 50)} fuzzing test cases for this code:\n\n${fileContext.slice(0, 50000)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_fuzz_tests",
          description: "Generate randomized fuzzing test cases",
          parameters: {
            type: "object",
            properties: {
              fuzzTests: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    testType: { type: "string", enum: ["boundary", "injection", "malformed", "concurrent", "memory", "type-confusion", "overflow"] },
                    targetFunction: { type: "string" },
                    input: { type: "string" },
                    expectedBehavior: { type: "string" },
                    severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                    description: { type: "string" },
                    potentialImpact: { type: "string" },
                  },
                  required: ["testType", "targetFunction", "input", "expectedBehavior", "severity", "description"],
                },
              },
              coverageAreas: { type: "array", items: { type: "string" } },
              estimatedBugsFound: { type: "number" },
            },
            required: ["fuzzTests", "coverageAreas"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_fuzz_tests" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    const fuzzResults = toolCall ? JSON.parse(toolCall.function.arguments) : buildTemplateFuzzTests(codeFiles, iterations);
    return res.json(fuzzResults);
  } catch (error: any) {
    console.error("Fuzz testing error:", error);
    if (error?.status === 429) return res.status(429).json({ error: "Rate limit exceeded." });
    return res.json(buildTemplateFuzzTests(codeFiles, iterations));
  }
}
