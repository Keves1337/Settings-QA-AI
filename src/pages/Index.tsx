import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SDLCPipeline } from "@/components/SDLCPipeline";
import { TaskList, Task } from "@/components/TaskList";
import { StatsCards } from "@/components/StatsCards";
import { ProjectManager } from "@/components/ProjectManager";
import { Sparkles, Zap, BarChart3, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const { toast } = useToast();
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [stats, setStats] = useState<Array<{
    label: string;
    value: string;
    change: string;
    trend: "up" | "down" | "neutral";
    icon: "progress" | "completed" | "active" | "blocked";
  }>>([
    {
      label: "Active Projects",
      value: "0",
      change: "+0 new",
      trend: "neutral",
      icon: "active",
    },
    {
      label: "Completed Tasks",
      value: "0",
      change: "+0 today",
      trend: "neutral",
      icon: "completed",
    },
    {
      label: "In Progress",
      value: "0",
      change: "0 critical",
      trend: "neutral",
      icon: "progress",
    },
    {
      label: "Test Coverage",
      value: "0%",
      change: "+0% this week",
      trend: "neutral",
      icon: "completed",
    },
  ]);

  useEffect(() => {
    loadStats();
    loadPhases();
    loadTasks();

    // Real-time subscription for stats updates
    const channel = supabase
      .channel('stats-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects'
      }, () => {
        loadStats();
        loadPhases();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'test_cases'
      }, () => {
        loadStats();
        loadPhases();
        loadTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_project_stats');
      
      if (error) throw error;

      if (data && typeof data === 'object') {
        const statsData = data as any;
        
        setStats([
          {
            label: "Active Projects",
            value: String(statsData.active_projects || 0),
            change: `${statsData.active_projects > 0 ? '+' : ''}${statsData.active_projects} active`,
            trend: statsData.active_projects > 0 ? "up" : "neutral",
            icon: "active",
          },
          {
            label: "Completed Tasks",
            value: String(statsData.completed_tasks || 0),
            change: `${statsData.completed_tasks} approved`,
            trend: statsData.completed_tasks > 0 ? "up" : "neutral",
            icon: "completed",
          },
          {
            label: "In Progress",
            value: String(statsData.in_progress || 0),
            change: `${statsData.in_progress} drafts`,
            trend: "neutral",
            icon: "progress",
          },
          {
            label: "Test Coverage",
            value: `${Number(statsData.avg_test_coverage || 0).toFixed(0)}%`,
            change: `Avg across projects`,
            trend: statsData.avg_test_coverage > 75 ? "up" : statsData.avg_test_coverage > 50 ? "neutral" : "down",
            icon: "completed",
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadPhases = async () => {
    try {
      const { data, error } = await supabase.rpc('get_phase_stats');
      
      if (error) throw error;

      if (data && typeof data === 'object') {
        const phaseData = data as any;
        
        // Determine status based on progress and active projects
        const getPhaseStatus = (progress: number, projects: number) => {
          if (progress === 100) return "completed";
          if (projects > 0 || progress > 0) return "active";
          return "pending";
        };

        setPhases([
          {
            id: "planning",
            name: "Planning",
            description: "Define scope and goals",
            status: getPhaseStatus(phaseData.planning.progress, phaseData.planning.projects),
            progress: phaseData.planning.progress || 0,
            tasks: phaseData.planning.tasks || 0,
          },
          {
            id: "requirements",
            name: "Requirements",
            description: "Gather specifications",
            status: getPhaseStatus(phaseData.requirements.progress, phaseData.requirements.projects),
            progress: phaseData.requirements.progress || 0,
            tasks: phaseData.requirements.tasks || 0,
          },
          {
            id: "design",
            name: "Design",
            description: "Create architecture",
            status: getPhaseStatus(phaseData.design.progress, phaseData.design.projects),
            progress: phaseData.design.progress || 0,
            tasks: phaseData.design.tasks || 0,
          },
          {
            id: "development",
            name: "Development",
            description: "Code implementation",
            status: getPhaseStatus(phaseData.development.progress, phaseData.development.projects),
            progress: phaseData.development.progress || 0,
            tasks: phaseData.development.tasks || 0,
          },
          {
            id: "testing",
            name: "Testing",
            description: "Quality assurance",
            status: getPhaseStatus(phaseData.testing.progress, phaseData.testing.projects),
            progress: phaseData.testing.progress || 0,
            tasks: phaseData.testing.tasks || 0,
          },
          {
            id: "deployment",
            name: "Deployment",
            description: "Release to production",
            status: getPhaseStatus(phaseData.deployment.progress, phaseData.deployment.projects),
            progress: phaseData.deployment.progress || 0,
            tasks: phaseData.deployment.tasks || 0,
          },
          {
            id: "maintenance",
            name: "Maintenance",
            description: "Ongoing support",
            status: getPhaseStatus(phaseData.maintenance.progress, phaseData.maintenance.projects),
            progress: phaseData.maintenance.progress || 0,
            tasks: phaseData.maintenance.tasks || 0,
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading phases:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('test_cases')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      if (data) {
        const mappedTasks: Task[] = data.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          priority: task.priority as "low" | "medium" | "high",
          status: task.status === 'approved' ? 'done' : task.status === 'draft' ? 'todo' : 'in-progress',
          phase: task.phase,
          sprint: task.sprint || undefined,
          story_points: task.story_points || undefined,
        }));
        setTasks(mappedTasks);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
  };

  const [phases, setPhases] = useState([
    {
      id: "planning",
      name: "Planning",
      description: "Define scope and goals",
      status: "completed" as const,
      progress: 100,
      tasks: 8,
    },
    {
      id: "requirements",
      name: "Requirements",
      description: "Gather specifications",
      status: "completed" as const,
      progress: 100,
      tasks: 12,
    },
    {
      id: "design",
      name: "Design",
      description: "Create architecture",
      status: "active" as const,
      progress: 65,
      tasks: 10,
    },
    {
      id: "development",
      name: "Development",
      description: "Code implementation",
      status: "pending" as const,
      progress: 20,
      tasks: 24,
    },
    {
      id: "testing",
      name: "Testing",
      description: "Quality assurance",
      status: "pending" as const,
      progress: 0,
      tasks: 15,
    },
    {
      id: "deployment",
      name: "Deployment",
      description: "Release to production",
      status: "pending" as const,
      progress: 0,
      tasks: 6,
    },
    {
      id: "maintenance",
      name: "Maintenance",
      description: "Ongoing support",
      status: "pending" as const,
      progress: 0,
      tasks: 8,
    },
  ]);

  const [tasks, setTasks] = useState<Task[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateTasks = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-tasks', {
        body: { 
          phase: selectedPhase,
          existingTasks: tasks.map(t => ({ title: t.title, phase: t.phase }))
        }
      });

      if (error) throw error;

      const newTasks = data.tasks.map((task: any, index: number) => ({
        id: `${Date.now()}-${index}`,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: "todo" as const,
        phase: task.phase,
      }));

      setTasks(prev => [...prev, ...newTasks]);
      
      toast({
        title: "Tasks Generated! ✨",
        description: `Added ${newTasks.length} new tasks to your project`,
      });
    } catch (error) {
      console.error('Error generating tasks:', error);
      toast({
        title: "Error",
        description: "Failed to generate tasks. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePhaseClick = (phase: any) => {
    setSelectedPhase(phase.id);
    toast({
      title: phase.name,
      description: `${phase.tasks} tasks • ${phase.progress}% complete`,
    });
  };

  const handleTaskToggle = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === "done" ? "draft" : "approved";
    
    try {
      const { error } = await supabase
        .from('test_cases')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (error) throw error;

      // Optimistically update UI
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: task.status === "done" ? "todo" : "done",
              }
            : t
        )
      );
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    }
  };

  const filteredTasks =
    selectedPhase === "all"
      ? tasks
      : tasks.filter(
          (task) => task.phase.toLowerCase() === selectedPhase
        );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-premium sticky top-0 z-50 border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow smooth-transition hover:scale-110">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold gradient-text">
                  Settings Automation
                </h1>
                <p className="text-sm text-muted-foreground">
                  Intelligent development lifecycle management
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleGenerateTasks} 
                className="gap-2"
                disabled={isGenerating}
              >
                <Sparkles className="w-4 h-4" />
                {isGenerating ? "Generating..." : "Generate Tasks with AI"}
              </Button>
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => window.location.href = '/automated-qa'}
              >
                <Sparkles className="w-4 h-4" />
                Automated QA
              </Button>
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => window.location.href = '/qa-testing'}
              >
                <BarChart3 className="w-4 h-4" />
                QA Settings
              </Button>
              <Button 
                variant="ghost"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="animate-fade-in">
          <StatsCards stats={stats} />
        </div>

        {/* Projects Section */}
        <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <ProjectManager />
        </div>

        {/* SDLC Pipeline */}
        <div className="space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold gradient-text">Development Pipeline</h2>
              <p className="text-muted-foreground">
                Track your project through each phase
              </p>
            </div>
          </div>
          <SDLCPipeline phases={phases} onPhaseClick={handlePhaseClick} />
        </div>

        {/* Tasks */}
        <Card className="p-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <Tabs defaultValue="all" value={selectedPhase} onValueChange={setSelectedPhase}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Tasks</h2>
                <p className="text-muted-foreground">
                  {filteredTasks.length} tasks
                </p>
              </div>
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="planning">Planning</TabsTrigger>
                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="development">Development</TabsTrigger>
                <TabsTrigger value="testing">Testing</TabsTrigger>
                <TabsTrigger value="deployment">Deployment</TabsTrigger>
                <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value={selectedPhase} className="mt-0">
              <TaskList tasks={filteredTasks} onTaskToggle={handleTaskToggle} />
            </TabsContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
};

export default Index;
