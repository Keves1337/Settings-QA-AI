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

    // Real-time subscription for stats updates
    const channel = supabase
      .channel('stats-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects'
      }, () => {
        loadStats();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'test_cases'
      }, () => {
        loadStats();
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

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      title: "Create database schema design",
      description: "Design normalized database structure with relationships",
      priority: "high",
      status: "in-progress",
      phase: "Design",
    },
    {
      id: "2",
      title: "Design API endpoints",
      description: "Define RESTful API structure and documentation",
      priority: "high",
      status: "in-progress",
      phase: "Design",
    },
    {
      id: "3",
      title: "Create wireframes for dashboard",
      description: "Design user interface mockups for main dashboard",
      priority: "medium",
      status: "todo",
      phase: "Design",
    },
    {
      id: "4",
      title: "Set up development environment",
      description: "Configure local and staging environments",
      priority: "high",
      status: "done",
      phase: "Development",
    },
    {
      id: "5",
      title: "Implement authentication system",
      description: "Build secure user authentication with JWT",
      priority: "high",
      status: "todo",
      phase: "Development",
    },
    {
      id: "6",
      title: "Write unit tests",
      description: "Create comprehensive test suite for core features",
      priority: "medium",
      status: "todo",
      phase: "Testing",
    },
  ]);

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

  const handleTaskToggle = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: task.status === "done" ? "in-progress" : "done",
            }
          : task
      )
    );
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
                  SDLC Automation
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
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="development">Development</TabsTrigger>
                <TabsTrigger value="testing">Testing</TabsTrigger>
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
