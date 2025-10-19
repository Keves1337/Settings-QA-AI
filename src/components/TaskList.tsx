import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in-progress" | "done";
  phase: string;
}

interface TaskListProps {
  tasks: Task[];
  onTaskToggle: (taskId: string) => void;
}

export const TaskList = ({ tasks, onTaskToggle }: TaskListProps) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-destructive border-destructive";
      case "medium":
        return "text-warning border-warning";
      default:
        return "text-muted-foreground border-muted";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "in-progress":
        return <Clock className="w-4 h-4 text-primary" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Card
          key={task.id}
          className={cn(
            "p-4 transition-all hover:shadow-md",
            task.status === "done" && "opacity-60"
          )}
        >
          <div className="flex items-start gap-4">
            <Checkbox
              checked={task.status === "done"}
              onCheckedChange={() => onTaskToggle(task.id)}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={cn(
                    "font-medium",
                    task.status === "done" && "line-through text-muted-foreground"
                  )}
                >
                  {task.title}
                </h4>
                <Badge
                  variant="outline"
                  className={cn("text-xs", getPriorityColor(task.priority))}
                >
                  {task.priority}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {getStatusIcon(task.status)}
                  <span className="capitalize">{task.status.replace("-", " ")}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{task.description}</p>
              <Badge variant="secondary" className="text-xs">
                {task.phase}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
