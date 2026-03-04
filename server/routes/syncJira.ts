import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export async function syncJira(req: Request, res: Response) {
  const { bugId, action } = req.body;

  if (!bugId || typeof bugId !== "string") {
    return res.status(400).json({ error: "Invalid bugId" });
  }
  if (!action || !["create", "update"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be create or update" });
  }

  try {
    const supabase = getSupabase();

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
    } else {
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
  } catch (error: any) {
    console.error("Jira sync error:", error);
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
