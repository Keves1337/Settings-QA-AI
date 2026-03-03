import { Request, Response } from "express";
import OpenAI from "openai";

export async function fuzzTesting(req: Request, res: Response) {
  const { codeFiles, testConfig } = req.body;

  if (!codeFiles || !Array.isArray(codeFiles)) {
    return res.status(400).json({ error: "Invalid codeFiles array" });
  }
  if (codeFiles.length === 0) {
    return res.status(400).json({ error: "At least one code file required" });
  }
  if (codeFiles.length > 20) {
    return res.status(400).json({ error: "Maximum 20 code files allowed" });
  }

  for (const file of codeFiles) {
    if (!file.name || typeof file.name !== "string") {
      return res.status(400).json({ error: "Invalid file name" });
    }
    if (!file.content || typeof file.content !== "string") {
      return res.status(400).json({ error: "Invalid file content" });
    }
    if (file.content.length > 500000) {
      return res.status(400).json({ error: "File too large. Maximum 500KB per file" });
    }
  }

  if (!testConfig || typeof testConfig !== "object") {
    return res.status(400).json({ error: "Invalid testConfig" });
  }

  const iterations = testConfig.iterations || 100;
  if (typeof iterations !== "number" || iterations < 1 || iterations > 500) {
    return res.status(400).json({ error: "Iterations must be between 1 and 500" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const fileContext = codeFiles.map((file: any) => `File: ${file.path || file.name}\n${file.content}`).join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert fuzzing and property-based testing engineer. Analyze the code and generate extreme edge cases and randomized tests to find bugs. Generate fuzz tests covering: boundary values, injection attempts, malformed data, concurrent access patterns, memory issues, type confusion, and overflow scenarios.`,
        },
        {
          role: "user",
          content: `Generate ${Math.min(iterations, 50)} fuzzing test cases for this code:\n\n${fileContext.slice(0, 50000)}`,
        },
      ],
      tools: [
        {
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
        },
      ],
      tool_choice: { type: "function", function: { name: "generate_fuzz_tests" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    const fuzzResults = toolCall
      ? JSON.parse(toolCall.function.arguments)
      : { fuzzTests: [], coverageAreas: [], estimatedBugsFound: 0 };

    return res.json(fuzzResults);
  } catch (error: any) {
    console.error("Fuzz testing error:", error);
    if (error?.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded." });
    }
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
