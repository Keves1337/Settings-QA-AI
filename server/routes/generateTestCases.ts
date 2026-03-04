import { Request, Response } from "express";
import OpenAI from "openai";

function buildTemplateTestCases(feature: string, phase: string) {
  const p = (phase || "Testing") as string;
  return {
    testCases: [
      {
        title: `Verify ${feature} - Happy Path`,
        description: `Validate that ${feature} works correctly under normal expected conditions.`,
        steps: [
          "Navigate to the feature under test",
          "Provide valid input data",
          "Submit or trigger the action",
          "Verify the expected output is displayed",
          "Confirm any data persisted correctly",
        ],
        expectedResult: `${feature} completes successfully and the user sees a confirmation or expected result.`,
        priority: "high",
        phase: p,
        tags: ["smoke", "happy-path", "functional"],
      },
      {
        title: `Verify ${feature} - Invalid Input`,
        description: `Validate that ${feature} handles invalid or malformed input gracefully.`,
        steps: [
          "Navigate to the feature under test",
          "Enter invalid or empty input data",
          "Attempt to submit the action",
          "Verify an appropriate validation error is shown",
          "Confirm no unintended side effects occurred",
        ],
        expectedResult: "Validation error message is displayed clearly. No data corruption occurs.",
        priority: "high",
        phase: p,
        tags: ["negative", "validation", "error-handling"],
      },
      {
        title: `Verify ${feature} - Boundary Values`,
        description: `Test ${feature} with minimum, maximum, and edge-case values.`,
        steps: [
          "Navigate to the feature under test",
          "Test with minimum allowed value",
          "Test with maximum allowed value",
          "Test with values just outside the allowed range",
          "Verify behaviour at each boundary",
        ],
        expectedResult: "Boundary values are handled correctly. Out-of-range values are rejected with clear messages.",
        priority: "medium",
        phase: p,
        tags: ["boundary", "edge-case"],
      },
      {
        title: `Verify ${feature} - Performance`,
        description: `Validate that ${feature} responds within acceptable time thresholds under normal load.`,
        steps: [
          "Trigger the feature action",
          "Measure response time from action to result",
          "Repeat 5 times to get an average",
          "Compare against the defined SLA",
        ],
        expectedResult: "Feature responds within 2 seconds for 95% of requests under normal load.",
        priority: "medium",
        phase: p,
        tags: ["performance", "non-functional"],
      },
      {
        title: `Verify ${feature} - Security`,
        description: `Validate that ${feature} does not expose sensitive data or allow unauthorized access.`,
        steps: [
          "Attempt to access the feature without authentication",
          "Try SQL injection in input fields",
          "Check that sensitive data is masked in the UI",
          "Verify proper authorization for different user roles",
        ],
        expectedResult: "Unauthorized access is blocked. Input sanitization prevents injection attacks. Sensitive data is not exposed.",
        priority: "high",
        phase: p,
        tags: ["security", "authorization", "non-functional"],
      },
    ],
  };
}

export async function generateTestCases(req: Request, res: Response) {
  const { feature, existingTestCases, phase } = req.body;

  if (!feature || typeof feature !== "string") {
    return res.status(400).json({ error: "Invalid feature parameter" });
  }
  if (feature.length > 500) {
    return res.status(400).json({ error: "Feature description too long. Maximum 500 characters" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.json(buildTemplateTestCases(feature, phase));
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert QA engineer specialized in creating comprehensive test cases. Generate detailed, actionable test cases that cover functional, edge cases, and negative scenarios." },
        { role: "user", content: `Generate 5 comprehensive test cases for: ${feature}\n\nPhase: ${phase}\nExisting test cases to avoid duplicates: ${JSON.stringify(existingTestCases)}\n\nEach test case should include:\n- Clear title\n- Detailed description\n- Step-by-step test steps\n- Expected results\n- Priority level\n- Relevant tags` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_test_cases",
          description: "Generate comprehensive QA test cases",
          parameters: {
            type: "object",
            properties: {
              testCases: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    steps: { type: "array", items: { type: "string" } },
                    expectedResult: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    phase: { type: "string", enum: ["Planning", "Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"] },
                    tags: { type: "array", items: { type: "string" } },
                  },
                  required: ["title", "description", "steps", "expectedResult", "priority", "phase", "tags"],
                },
              },
            },
            required: ["testCases"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_test_cases" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return res.status(500).json({ error: "No test cases generated" });
    return res.json(JSON.parse(toolCall.function.arguments));
  } catch (error: any) {
    console.error("Error generating test cases:", error);
    if (error?.status === 429) return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
    return res.json(buildTemplateTestCases(feature, phase));
  }
}
