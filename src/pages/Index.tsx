import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SDLCPipeline } from "@/components/SDLCPipeline";
import { TaskList, Task } from "@/components/TaskList";
import { StatsCards } from "@/components/StatsCards";
import { Sparkles, Zap, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { toast } = useToast();
  const [selectedPhase, setSelectedPhase] = useState<string>("all");

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

  const stats = [
    {
      label: "Overall Progress",
      value: "41%",
      change: "+12%",
      trend: "up" as const,
      icon: "progress" as const,
    },
    {
      label: "Completed Tasks",
      value: "23",
      change: "+5",
      trend: "up" as const,
      icon: "completed" as const,
    },
    {
      label: "Active Tasks",
      value: "12",
      change: "3 today",
      trend: "neutral" as const,
      icon: "active" as const,
    },
    {
      label: "Days Remaining",
      value: "45",
      change: "On track",
      trend: "neutral" as const,
      icon: "blocked" as const,
    },
  ];

  const handleGenerateTasks = () => {
    toast({
      title: "AI Task Generation",
      description: "Connect Lovable Cloud to enable AI-powered task automation!",
    });
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  SDLC Automation
                </h1>
                <p className="text-sm text-muted-foreground">
                  Intelligent development lifecycle management
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleGenerateTasks} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Generate Tasks with AI
              </Button>
              <Button variant="outline" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Analytics
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <StatsCards stats={stats} />

        {/* SDLC Pipeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Development Pipeline</h2>
              <p className="text-muted-foreground">
                Track your project through each phase
              </p>
            </div>
          </div>
          <SDLCPipeline phases={phases} onPhaseClick={handlePhaseClick} />
        </div>

        {/* Tasks */}
        <Card className="p-6">
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
