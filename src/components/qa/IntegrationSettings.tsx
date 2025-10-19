import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Github, FileText, Save } from "lucide-react";

export const IntegrationSettings = () => {
  const { toast } = useToast();
  const [jiraConfig, setJiraConfig] = useState({
    jiraUrl: "",
    email: "",
    apiToken: "",
    projectKey: "",
    enabled: false,
    autoSync: false,
  });
  const [githubConfig, setGithubConfig] = useState({
    token: "",
    owner: "",
    repo: "",
    enabled: false,
    autoSync: false,
  });

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    // Load Jira config
    const { data: jiraData } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "jira")
      .single();

    if (jiraData) {
      const config = jiraData.config as any;
      setJiraConfig({
        jiraUrl: config.jiraUrl || "",
        email: config.email || "",
        apiToken: config.apiToken || "",
        projectKey: config.projectKey || "",
        enabled: jiraData.enabled,
        autoSync: config.autoSync || false,
      });
    }

    // Load GitHub config
    const { data: githubData } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "github")
      .single();

    if (githubData) {
      const config = githubData.config as any;
      setGithubConfig({
        token: config.token || "",
        owner: config.owner || "",
        repo: config.repo || "",
        enabled: githubData.enabled,
        autoSync: config.autoSync || false,
      });
    }
  };

  const saveJiraIntegration = async () => {
    const { data: existing } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "jira")
      .single();

    const config = {
      jiraUrl: jiraConfig.jiraUrl,
      email: jiraConfig.email,
      apiToken: jiraConfig.apiToken,
      projectKey: jiraConfig.projectKey,
      autoSync: jiraConfig.autoSync,
    };

    if (existing) {
      const { error } = await supabase
        .from("integrations")
        .update({ config, enabled: jiraConfig.enabled })
        .eq("id", existing.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update Jira integration",
          variant: "destructive",
        });
        return;
      }
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert({ type: "jira", config, enabled: jiraConfig.enabled });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to save Jira integration",
          variant: "destructive",
        });
        return;
      }
    }

    toast({
      title: "Success",
      description: "Jira integration saved successfully",
    });
  };

  const saveGitHubIntegration = async () => {
    const { data: existing } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "github")
      .single();

    const config = {
      token: githubConfig.token,
      owner: githubConfig.owner,
      repo: githubConfig.repo,
      autoSync: githubConfig.autoSync,
    };

    if (existing) {
      const { error } = await supabase
        .from("integrations")
        .update({ config, enabled: githubConfig.enabled })
        .eq("id", existing.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update GitHub integration",
          variant: "destructive",
        });
        return;
      }
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert({ type: "github", config, enabled: githubConfig.enabled });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to save GitHub integration",
          variant: "destructive",
        });
        return;
      }
    }

    toast({
      title: "Success",
      description: "GitHub integration saved successfully",
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Integration Settings</h2>

      {/* Jira Integration */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Jira Integration</h3>
              <p className="text-sm text-muted-foreground">
                Sync bugs to Jira automatically
              </p>
            </div>
          </div>
          <Switch
            checked={jiraConfig.enabled}
            onCheckedChange={(checked) =>
              setJiraConfig({ ...jiraConfig, enabled: checked })
            }
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Jira URL</label>
            <Input
              placeholder="https://your-domain.atlassian.net"
              value={jiraConfig.jiraUrl}
              onChange={(e) => setJiraConfig({ ...jiraConfig, jiraUrl: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              placeholder="your-email@example.com"
              value={jiraConfig.email}
              onChange={(e) => setJiraConfig({ ...jiraConfig, email: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">API Token</label>
            <Input
              type="password"
              placeholder="Your Jira API token"
              value={jiraConfig.apiToken}
              onChange={(e) => setJiraConfig({ ...jiraConfig, apiToken: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Project Key</label>
            <Input
              placeholder="e.g., PROJ"
              value={jiraConfig.projectKey}
              onChange={(e) => setJiraConfig({ ...jiraConfig, projectKey: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <label className="text-sm font-medium">Auto-sync bugs to Jira</label>
              <p className="text-xs text-muted-foreground">
                Automatically create Jira issues when bugs are reported
              </p>
            </div>
            <Switch
              checked={jiraConfig.autoSync}
              onCheckedChange={(checked) =>
                setJiraConfig({ ...jiraConfig, autoSync: checked })
              }
            />
          </div>
          <Button onClick={saveJiraIntegration} className="gap-2">
            <Save className="w-4 h-4" />
            Save Jira Settings
          </Button>
        </div>
      </Card>

      {/* GitHub Integration */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
              <Github className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">GitHub Integration</h3>
              <p className="text-sm text-muted-foreground">
                Create and sync issues with GitHub
              </p>
            </div>
          </div>
          <Switch
            checked={githubConfig.enabled}
            onCheckedChange={(checked) =>
              setGithubConfig({ ...githubConfig, enabled: checked })
            }
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Personal Access Token</label>
            <Input
              type="password"
              placeholder="ghp_..."
              value={githubConfig.token}
              onChange={(e) => setGithubConfig({ ...githubConfig, token: e.target.value })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Need repo and issues permissions
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Repository Owner</label>
            <Input
              placeholder="your-username or org-name"
              value={githubConfig.owner}
              onChange={(e) => setGithubConfig({ ...githubConfig, owner: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Repository Name</label>
            <Input
              placeholder="repository-name"
              value={githubConfig.repo}
              onChange={(e) => setGithubConfig({ ...githubConfig, repo: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <label className="text-sm font-medium">Auto-sync bugs to GitHub</label>
              <p className="text-xs text-muted-foreground">
                Automatically create GitHub issues when bugs are reported
              </p>
            </div>
            <Switch
              checked={githubConfig.autoSync}
              onCheckedChange={(checked) =>
                setGithubConfig({ ...githubConfig, autoSync: checked })
              }
            />
          </div>
          <Button onClick={saveGitHubIntegration} className="gap-2">
            <Save className="w-4 h-4" />
            Save GitHub Settings
          </Button>
        </div>
      </Card>
    </div>
  );
};
