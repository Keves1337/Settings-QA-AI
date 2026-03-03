import { Request, Response } from "express";
import OpenAI from "openai";

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
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert QA engineer specialized in creating comprehensive test cases. Generate detailed, actionable test cases that cover functional, edge cases, and negative scenarios.",
        },
        {
          role: "user",
          content: `Generate 5 comprehensive test cases for: ${feature}\n\nPhase: ${phase}\nExisting test cases to avoid duplicates: ${JSON.stringify(existingTestCases)}\n\nEach test case should include:\n- Clear title\n- Detailed description\n- Step-by-step test steps\n- Expected results\n- Priority level\n- Relevant tags`,
        },
      ],
      tools: [
        {
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
        },
      ],
      tool_choice: { type: "function", function: { name: "generate_test_cases" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return res.status(500).json({ error: "No test cases generated" });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return res.json(result);
  } catch (error: any) {
    console.error("Error generating test cases:", error);
    if (error?.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
    }
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
