import { Request, Response } from "express";
import OpenAI from "openai";

export async function generateTasks(req: Request, res: Response) {
  const { phase, existingTasks } = req.body;

  if (!phase || typeof phase !== "string") {
    return res.status(400).json({ error: "Invalid phase parameter" });
  }

  const validPhases = ["all", "Planning", "Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"];
  if (!validPhases.includes(phase)) {
    return res.status(400).json({ error: "Invalid phase value" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const userPrompt = phase === "all"
      ? `Generate 5 diverse tasks across different SDLC phases (Planning, Requirements, Design, Development, Testing, Deployment, Maintenance). Consider existing tasks to avoid duplicates: ${JSON.stringify(existingTasks)}`
      : `Generate 3-5 specific tasks for the ${phase} phase of the SDLC. Consider existing tasks to avoid duplicates: ${JSON.stringify(existingTasks)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant specialized in software development lifecycle (SDLC) management. Generate practical, actionable tasks for software development projects.",
        },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_tasks",
            description: "Generate actionable SDLC tasks with proper categorization",
            parameters: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      priority: { type: "string", enum: ["low", "medium", "high"] },
                      phase: { type: "string", enum: ["Planning", "Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"] },
                    },
                    required: ["title", "description", "priority", "phase"],
                  },
                },
              },
              required: ["tasks"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "generate_tasks" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return res.status(500).json({ error: "No tasks generated" });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return res.json(result);
  } catch (error: any) {
    console.error("Error generating tasks:", error);
    if (error?.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded." });
    }
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
