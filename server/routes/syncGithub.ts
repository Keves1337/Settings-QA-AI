import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

export async function syncGithub(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { bugId, action } = req.body;

  if (!bugId || typeof bugId !== "string") {
    return res.status(400).json({ error: "Invalid bugId" });
  }
  if (!action || !["create", "update"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be create or update" });
  }

  try {
    const { data: integrationData, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "github")
      .eq("enabled", true)
      .single();

    if (integrationError || !integrationData) {
      return res.status(400).json({ error: "GitHub integration not configured" });
    }

    const { token, owner, repo } = integrationData.config as any;
    const { data: bug, error: bugError } = await supabase.from("bugs").select("*").eq("id", bugId).single();

    if (bugError || !bug) {
      return res.status(404).json({ error: "Bug not found" });
    }

    if (action === "create") {
      const issueBody = `${bug.description}\n\n**Severity:** ${bug.severity}\n**Environment:** ${bug.environment || "Not specified"}\n${bug.steps_to_reproduce ? `\n**Steps to Reproduce:**\n${bug.steps_to_reproduce}` : ""}`;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title: bug.title, body: issueBody, labels: ["bug", bug.severity] }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(500).json({ error: `GitHub API error: ${response.status} - ${errorText}` });
      }

      const createdIssue = await response.json();
      await supabase.from("bugs").update({ github_issue_number: createdIssue.number }).eq("id", bugId);
      return res.json({ success: true, issueNumber: createdIssue.number, url: createdIssue.html_url });
    } else if (action === "update") {
      if (!bug.github_issue_number) {
        return res.status(400).json({ error: "Bug not linked to GitHub issue" });
      }

      const issueBody = `${bug.description}\n\n**Severity:** ${bug.severity}\n**Status:** ${bug.status}\n**Environment:** ${bug.environment || "Not specified"}\n${bug.steps_to_reproduce ? `\n**Steps to Reproduce:**\n${bug.steps_to_reproduce}` : ""}`;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${bug.github_issue_number}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: bug.title,
          body: issueBody,
          state: bug.status === "closed" ? "closed" : "open",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(500).json({ error: `GitHub API error: ${response.status} - ${errorText}` });
      }

      return res.json({ success: true });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error: any) {
    console.error("GitHub sync error:", error);
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
