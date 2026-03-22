import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SDLCPipeline } from "@/components/SDLCPipeline";
import { TaskList, Task } from "@/components/TaskList";
import { StatsCards } from "@/components/StatsCards";
import { ProjectManager } from "@/components/ProjectManager";
import { Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
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
      const res = await fetch("/api/stats");
      if (!res.ok) return;
      const statsData = await res.json();

      if (statsData && typeof statsData === 'object') {
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
    } catch {
    }
  };

  const loadPhases = async () => {
    try {
      const res = await fetch("/api/phase-stats");
      if (!res.ok) return;
      const phaseData = await res.json();

      if (phaseData && typeof phaseData === 'object') {
        const pd = phaseData as any;
        
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
            status: getPhaseStatus(pd.planning?.progress ?? 0, pd.planning?.projects ?? 0),
            progress: pd.planning?.progress || 0,
            tasks: pd.planning?.tasks || 0,
          },
          {
            id: "requirements",
            name: "Requirements",
            description: "Gather specifications",
            status: getPhaseStatus(pd.requirements?.progress ?? 0, pd.requirements?.projects ?? 0),
            progress: pd.requirements?.progress || 0,
            tasks: pd.requirements?.tasks || 0,
          },
          {
            id: "design",
            name: "Design",
            description: "Create architecture",
            status: getPhaseStatus(pd.design?.progress ?? 0, pd.design?.projects ?? 0),
            progress: pd.design?.progress || 0,
            tasks: pd.design?.tasks || 0,
          },
          {
            id: "development",
            name: "Development",
            description: "Code implementation",
            status: getPhaseStatus(pd.development?.progress ?? 0, pd.development?.projects ?? 0),
            progress: pd.development?.progress || 0,
            tasks: pd.development?.tasks || 0,
          },
          {
            id: "testing",
            name: "Testing",
            description: "Quality assurance",
            status: getPhaseStatus(pd.testing?.progress ?? 0, pd.testing?.projects ?? 0),
            progress: pd.testing?.progress || 0,
            tasks: pd.testing?.tasks || 0,
          },
          {
            id: "deployment",
            name: "Deployment",
            description: "Release to production",
            status: getPhaseStatus(pd.deployment?.progress ?? 0, pd.deployment?.projects ?? 0),
            progress: pd.deployment?.progress || 0,
            tasks: pd.deployment?.tasks || 0,
          },
          {
            id: "maintenance",
            name: "Maintenance",
            description: "Ongoing support",
            status: getPhaseStatus(pd.maintenance?.progress ?? 0, pd.maintenance?.projects ?? 0),
            progress: pd.maintenance?.progress || 0,
            tasks: pd.maintenance?.tasks || 0,
          },
        ]);
      }
    } catch {
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
      const res = await fetch("/api/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: selectedPhase,
          existingTasks: tasks.map(t => ({ title: t.title, phase: t.phase })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

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
      <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Projects, pipeline & task management</p>
          </div>
          <Button
            onClick={handleGenerateTasks}
            className="gap-2 self-start sm:self-auto"
            disabled={isGenerating}
            data-testid="button-generate-tasks"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating ? "Generating..." : "Generate Tasks"}
          </Button>
        </div>
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
        <Card className="p-4 sm:p-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <Tabs defaultValue="all" value={selectedPhase} onValueChange={setSelectedPhase}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Tasks</h2>
                <p className="text-muted-foreground text-sm">
                  {filteredTasks.length} tasks
                </p>
              </div>
              <TabsList className="flex overflow-x-auto h-auto p-1 flex-nowrap scrollbar-none w-full sm:w-auto">
                <TabsTrigger value="all" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">All</TabsTrigger>
                <TabsTrigger value="planning" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">Planning</TabsTrigger>
                <TabsTrigger value="requirements" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">
                  <span className="hidden sm:inline">Requirements</span>
                  <span className="sm:hidden">Req.</span>
                </TabsTrigger>
                <TabsTrigger value="design" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">Design</TabsTrigger>
                <TabsTrigger value="development" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">
                  <span className="hidden sm:inline">Development</span>
                  <span className="sm:hidden">Dev</span>
                </TabsTrigger>
                <TabsTrigger value="testing" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">Testing</TabsTrigger>
                <TabsTrigger value="deployment" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">
                  <span className="hidden sm:inline">Deployment</span>
                  <span className="sm:hidden">Deploy</span>
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="flex-shrink-0 text-xs sm:text-sm px-2.5 py-1.5">
                  <span className="hidden sm:inline">Maintenance</span>
                  <span className="sm:hidden">Maint.</span>
                </TabsTrigger>
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
