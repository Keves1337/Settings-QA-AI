import { Request, Response } from "express";
import OpenAI from "openai";

export async function analyzeProjectQA(req: Request, res: Response) {
  const { files, projectFiles, url, streaming = false } = req.body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  let filesToAnalyze = files || projectFiles;

  if (url) {
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch URL: ${response.status}` });
      }

      let content = await response.text();
      if (content.length > 800000) content = content.slice(0, 800000);
      filesToAnalyze = [{ name: url, content, type: response.headers.get("content-type") || "text/html" }];
    } catch (error: any) {
      return res.status(400).json({ error: `Failed to fetch URL: ${error.message}` });
    }
  }

  if (!filesToAnalyze || !Array.isArray(filesToAnalyze)) {
    return res.status(400).json({ error: "Invalid files array" });
  }
  if (filesToAnalyze.length === 0) return res.status(400).json({ error: "At least one file required" });
  if (filesToAnalyze.length > 50) return res.status(400).json({ error: "Maximum 50 files allowed" });

  for (const file of filesToAnalyze) {
    if (!file.name && !file.path) return res.status(400).json({ error: "Invalid file: missing name or path" });
    if (!file.content || typeof file.content !== "string") return res.status(400).json({ error: "Invalid file content" });
  }

  const MAX_CONTENT_PER_FILE = 50000;
  const MAX_TOTAL_CONTENT = 200000;
  let totalChars = 0;
  const processedFiles: Array<{ name: string; content: string }> = [];

  for (const file of filesToAnalyze) {
    const name = file.name || file.path;
    let content = file.content as string;
    if (content.length > MAX_CONTENT_PER_FILE) content = content.slice(0, MAX_CONTENT_PER_FILE);
    if (totalChars + content.length > MAX_TOTAL_CONTENT) {
      const remaining = Math.max(0, MAX_TOTAL_CONTENT - totalChars);
      if (remaining <= 0) break;
      content = content.slice(0, remaining);
    }
    totalChars += content.length;
    processedFiles.push({ name, content });
    if (totalChars >= MAX_TOTAL_CONTENT) break;
  }

  const fileContext = processedFiles.map((f) => `File: ${f.name}\n${f.content}`).join("\n\n");

  const systemPrompt = `You are a senior QA testing specialist. Analyze the provided code/content and generate a comprehensive QA test report. Identify issues, security concerns, accessibility problems, performance issues, and provide passed checks. Use the generate_qa_report function to structure your findings.`;

  const sendProgress = (progress: number, message: string) => `data: ${JSON.stringify({ progress, message })}\n\n`;

  if (streaming) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(sendProgress(10, "Initializing analysis..."));
    res.write(sendProgress(30, "Processing files..."));
    res.write(sendProgress(50, "Sending to AI for analysis..."));

    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this code and generate a QA report:\n\n${fileContext}` },
        ],
        tools: [buildQAReportTool()],
        tool_choice: { type: "function", function: { name: "generate_qa_report" } },
      });

      res.write(sendProgress(90, "Finalizing report..."));

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        res.write(`data: ${JSON.stringify({ error: "No report generated" })}\n\n`);
        return res.end();
      }

      const report = JSON.parse(toolCall.function.arguments);
      res.write(`data: ${JSON.stringify({ progress: 100, message: "Complete", result: report })}\n\n`);
      return res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error?.message || "Analysis failed" })}\n\n`);
      return res.end();
    }
  } else {
    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this code and generate a QA report:\n\n${fileContext}` },
        ],
        tools: [buildQAReportTool()],
        tool_choice: { type: "function", function: { name: "generate_qa_report" } },
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return res.status(500).json({ error: "No report generated" });
      }

      return res.json(JSON.parse(toolCall.function.arguments));
    } catch (error: any) {
      console.error("QA analysis error:", error);
      return res.status(500).json({ error: error?.message || "Analysis failed" });
    }
  }
}

function buildQAReportTool() {
  return {
    type: "function" as const,
    function: {
      name: "generate_qa_report",
      description: "Generate a structured QA test report",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            properties: {
              totalFiles: { type: "number" },
              criticalIssues: { type: "number" },
              highPriorityIssues: { type: "number" },
              warnings: { type: "number" },
              passedChecks: { type: "number" },
              overallStatus: { type: "string", enum: ["pass", "warning", "fail"] },
            },
            required: ["totalFiles", "criticalIssues", "highPriorityIssues", "warnings", "passedChecks", "overallStatus"],
          },
          criticalIssues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
                recommendation: { type: "string" },
                impact: { type: "string" },
              },
              required: ["type", "description", "location"],
            },
          },
          highPriorityIssues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
                recommendation: { type: "string" },
                impact: { type: "string" },
              },
              required: ["type", "description", "location"],
            },
          },
          warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["type", "description", "location"],
            },
          },
          passedChecks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
              },
              required: ["type", "description", "location"],
            },
          },
          detailedTests: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                testName: { type: "string" },
                status: { type: "string", enum: ["pass", "fail", "partial"] },
                description: { type: "string" },
                evidence: { type: "string" },
              },
              required: ["category", "testName", "status", "description"],
            },
          },
        },
        required: ["summary", "criticalIssues", "highPriorityIssues", "warnings", "passedChecks"],
      },
    },
  };
}
