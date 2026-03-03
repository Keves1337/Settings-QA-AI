import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

export async function syncJira(req: Request, res: Response) {
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
      .eq("type", "jira")
      .eq("enabled", true)
      .single();

    if (integrationError || !integrationData) {
      return res.status(400).json({ error: "Jira integration not configured" });
    }

    const { jiraUrl, email, apiToken, projectKey } = integrationData.config as any;
    const { data: bug, error: bugError } = await supabase.from("bugs").select("*").eq("id", bugId).single();

    if (bugError || !bug) {
      return res.status(404).json({ error: "Bug not found" });
    }

    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    if (action === "create") {
      const jiraIssue = {
        fields: {
          project: { key: projectKey },
          summary: bug.title,
          description: bug.description,
          issuetype: { name: "Bug" },
          priority: { name: (bug.severity as string).charAt(0).toUpperCase() + (bug.severity as string).slice(1) },
        },
      };

      const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(jiraIssue),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(500).json({ error: `Jira API error: ${response.status} - ${errorText}` });
      }

      const createdIssue = await response.json();
      await supabase.from("bugs").update({ jira_issue_key: createdIssue.key }).eq("id", bugId);
      return res.json({ success: true, issueKey: createdIssue.key });
    } else if (action === "update") {
      if (!bug.jira_issue_key) {
        return res.status(400).json({ error: "Bug not linked to Jira issue" });
      }

      const response = await fetch(`${jiraUrl}/rest/api/3/issue/${bug.jira_issue_key}`, {
        method: "PUT",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { summary: bug.title, description: bug.description } }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(500).json({ error: `Jira API error: ${response.status} - ${errorText}` });
      }

      return res.json({ success: true });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error: any) {
    console.error("Jira sync error:", error);
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
