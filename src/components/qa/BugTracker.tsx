import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Github, FileText, ExternalLink, Camera, X } from "lucide-react";

export const BugTracker = () => {
  const { toast } = useToast();
  const [bugs, setBugs] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newBug, setNewBug] = useState({
    title: "",
    description: "",
    severity: "medium",
    status: "open",
    steps_to_reproduce: "",
    environment: "",
  });

  const loadBugs = async () => {
    const { data, error } = await supabase
      .from("bugs")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setBugs(data);
    }
  };

  useEffect(() => {
    loadBugs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newScreenshots: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      await new Promise((resolve) => {
        reader.onloadend = () => {
          if (reader.result) {
            newScreenshots.push(reader.result as string);
          }
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    }

    setScreenshots([...screenshots, ...newScreenshots]);
    setIsUploading(false);
    toast({
      title: "Success",
      description: `Added ${newScreenshots.length} screenshot(s)`,
    });
  };

  const removeScreenshot = (index: number) => {
    setScreenshots(screenshots.filter((_, i) => i !== index));
  };

  const createBug = async () => {
    if (!newBug.title || !newBug.description) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    const { data: bugData, error } = await supabase
      .from("bugs")
      .insert(newBug)
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create bug",
        variant: "destructive",
      });
      return;
    }

    // Upload screenshots if any
    if (screenshots.length > 0 && bugData) {
      for (let i = 0; i < screenshots.length; i++) {
        const { error: screenshotError } = await supabase.functions.invoke(
          "capture-bug-screenshot",
          {
            body: {
              bugId: bugData.id,
              screenshotBase64: screenshots[i],
              fileName: `screenshot-${i + 1}.png`,
            },
          }
        );

        if (screenshotError) {
          console.error("Failed to upload screenshot:", screenshotError);
        }
      }
    }

    toast({
      title: "Success",
      description: "Bug created successfully with screenshots",
    });
    
    setIsDialogOpen(false);
    setNewBug({
      title: "",
      description: "",
      severity: "medium",
      status: "open",
      steps_to_reproduce: "",
      environment: "",
    });
    setScreenshots([]);
    loadBugs();

    // Auto-sync if enabled
    if (bugData) {
      await autoSyncBug(bugData.id);
    }
  };

  const autoSyncBug = async (bugId: string) => {
    // Check Jira auto-sync
    const { data: jiraData } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "jira")
      .eq("enabled", true)
      .single();

    if (jiraData) {
      const config = jiraData.config as any;
      if (config.autoSync) {
        await syncToJira(bugId);
      }
    }

    // Check GitHub auto-sync
    const { data: githubData } = await supabase
      .from("integrations")
      .select("*")
      .eq("type", "github")
      .eq("enabled", true)
      .single();

    if (githubData) {
      const config = githubData.config as any;
      if (config.autoSync) {
        await syncToGitHub(bugId);
      }
    }
  };

  const syncToJira = async (bugId: string) => {
    const { data, error } = await supabase.functions.invoke("sync-jira", {
      body: { bugId, action: "create" },
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to sync with Jira",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Created Jira issue: ${data.issueKey}`,
      });
      loadBugs();
    }
  };

  const syncToGitHub = async (bugId: string) => {
    const { data, error } = await supabase.functions.invoke("sync-github", {
      body: { bugId, action: "create" },
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to sync with GitHub",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Created GitHub issue #${data.issueNumber}`,
      });
      loadBugs();
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-500",
      high: "bg-orange-500",
      medium: "bg-yellow-500",
      low: "bg-blue-500",
    };
    return colors[severity] || "bg-gray-500";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: "bg-red-500",
      in_progress: "bg-yellow-500",
      resolved: "bg-green-500",
      closed: "bg-gray-500",
      wont_fix: "bg-purple-500",
    };
    return colors[status] || "bg-gray-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Bug Tracker</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Report Bug
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Report New Bug</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title *</label>
                <Input
                  placeholder="Brief description of the bug"
                  value={newBug.title}
                  onChange={(e) => setNewBug({ ...newBug, title: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description *</label>
                <Textarea
                  placeholder="Detailed description of the bug"
                  value={newBug.description}
                  onChange={(e) => setNewBug({ ...newBug, description: e.target.value })}
                  className="mt-1"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Severity</label>
                  <Select
                    value={newBug.severity}
                    onValueChange={(value) => setNewBug({ ...newBug, severity: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={newBug.status}
                    onValueChange={(value) => setNewBug({ ...newBug, status: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Steps to Reproduce</label>
                <Textarea
                  placeholder="1. Navigate to...\n2. Click on...\n3. Observe..."
                  value={newBug.steps_to_reproduce}
                  onChange={(e) =>
                    setNewBug({ ...newBug, steps_to_reproduce: e.target.value })
                  }
                  className="mt-1"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Environment</label>
                <Input
                  placeholder="e.g., Chrome 120, Windows 11, Production"
                  value={newBug.environment}
                  onChange={(e) => setNewBug({ ...newBug, environment: e.target.value })}
                  className="mt-1"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Screenshots</label>
                <div className="mt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    {isUploading ? "Uploading..." : "Add Screenshots"}
                  </Button>
                </div>
                
                {screenshots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {screenshots.map((screenshot, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={screenshot}
                          alt={`Screenshot ${index + 1}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeScreenshot(index)}
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <Button onClick={createBug} className="w-full" disabled={isUploading}>
                Create Bug
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {bugs.map((bug) => (
          <Card key={bug.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold">{bug.title}</h3>
                  <Badge className={getSeverityColor(bug.severity)}>{bug.severity}</Badge>
                  <Badge className={getStatusColor(bug.status)}>{bug.status}</Badge>
                  {bug.jira_issue_key && (
                    <Badge variant="outline" className="gap-1">
                      <FileText className="w-3 h-3" />
                      {bug.jira_issue_key}
                    </Badge>
                  )}
                  {bug.github_issue_number && (
                    <Badge variant="outline" className="gap-1">
                      <Github className="w-3 h-3" />
                      #{bug.github_issue_number}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{bug.description}</p>
                {bug.steps_to_reproduce && (
                  <div className="mb-2">
                    <p className="text-sm font-medium">Steps to Reproduce:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {bug.steps_to_reproduce}
                    </p>
                  </div>
                )}
                {bug.environment && (
                  <p className="text-sm mb-2">
                    <span className="font-medium">Environment:</span> {bug.environment}
                  </p>
                )}
                {bug.screenshots && bug.screenshots.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium mb-2">Screenshots:</p>
                    <div className="grid grid-cols-4 gap-2">
                      {bug.screenshots.map((screenshot: string, index: number) => (
                        <a
                          key={index}
                          href={screenshot}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative group"
                        >
                          <img
                            src={screenshot}
                            alt={`Bug screenshot ${index + 1}`}
                            className="w-full h-20 object-cover rounded border hover:border-primary transition-colors"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                            <ExternalLink className="w-4 h-4 text-white" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {!bug.jira_issue_key && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToJira(bug.id)}
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Sync to Jira
                  </Button>
                )}
                {!bug.github_issue_number && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToGitHub(bug.id)}
                    className="gap-2"
                  >
                    <Github className="w-4 h-4" />
                    Sync to GitHub
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
