import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CheckCircle2, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  test_coverage: number;
  created_at: string;
  methodology?: string;
}

export const ProjectManager = () => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    test_coverage: 0,
    phase: "planning",
    methodology: "waterfall",
  });

  useEffect(() => {
    loadProjects();
    
    // Real-time subscription
    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects'
      }, () => {
        loadProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name) {
      toast({
        title: "Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from('projects').insert({
        name: newProject.name,
        description: newProject.description,
        test_coverage: newProject.test_coverage,
        phase: newProject.phase,
        methodology: newProject.methodology,
        status: 'active',
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Project created successfully",
      });

      setNewProject({ name: "", description: "", test_coverage: 0, phase: "planning", methodology: "waterfall" });
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId);

      if (error) throw error;

      toast({
        title: "Updated!",
        description: `Project marked as ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleDelete = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Project deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading projects...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold gradient-text">Active Projects</h2>
          <p className="text-muted-foreground">{projects.length} total projects</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-premium">
            <DialogHeader>
              <DialogTitle className="gradient-text">Create New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">Project Name</label>
                <Input
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="Enter project name"
                  className="mt-1 glass"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Enter project description"
                  className="mt-1 glass"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Initial Test Coverage (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newProject.test_coverage}
                  onChange={(e) => setNewProject({ ...newProject, test_coverage: Number(e.target.value) })}
                  className="mt-1 glass"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Methodology</label>
                <Select 
                  value={newProject.methodology} 
                  onValueChange={(value) => setNewProject({ ...newProject, methodology: value })}
                >
                  <SelectTrigger className="mt-1 glass">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-premium">
                    <SelectItem value="waterfall">Waterfall</SelectItem>
                    <SelectItem value="agile">Agile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">SDLC Phase</label>
                <Select 
                  value={newProject.phase} 
                  onValueChange={(value) => setNewProject({ ...newProject, phase: value })}
                >
                  <SelectTrigger className="mt-1 glass">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-premium">
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="requirements">Requirements</SelectItem>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="deployment">Deployment</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateProject} className="w-full">
                Create Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">No projects yet. Create your first project to get started!</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Create Project
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, index) => (
            <Card 
              key={project.id} 
              className="p-6 hover-glow group animate-fade-in"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{project.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {project.methodology || 'waterfall'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description || "No description"}
                    </p>
                  </div>
                  <Badge 
                    variant={
                      project.status === 'completed' ? 'default' : 
                      project.status === 'active' ? 'secondary' : 
                      'outline'
                    }
                  >
                    {project.status}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Test Coverage</span>
                    <span className="font-medium">{project.test_coverage}%</span>
                  </div>
                  <div className="w-full glass rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent smooth-transition"
                      style={{ width: `${project.test_coverage}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {project.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(project.id, 'completed')}
                      className="flex-1 gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Complete
                    </Button>
                  )}
                  {project.status !== 'archived' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(project.id, 'archived')}
                      className="flex-1 gap-2"
                    >
                      <Archive className="w-4 h-4" />
                      Archive
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(project.id)}
                    className="gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
