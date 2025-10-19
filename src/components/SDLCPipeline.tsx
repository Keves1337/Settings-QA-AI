import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Phase {
  id: string;
  name: string;
  description: string;
  status: "completed" | "active" | "pending";
  progress: number;
  tasks: number;
}

interface SDLCPipelineProps {
  phases: Phase[];
  onPhaseClick: (phase: Phase) => void;
}

export const SDLCPipeline = ({ phases, onPhaseClick }: SDLCPipelineProps) => {
  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {phases.map((phase, index) => (
          <Card
            key={phase.id}
            onClick={() => onPhaseClick(phase)}
            className={cn(
              "p-6 cursor-pointer smooth-transition hover:scale-[1.02] group animate-fade-in",
              phase.status === "active" && "ring-2 ring-primary glow",
              phase.status === "completed" && "bg-gradient-to-br from-card to-success/10"
            )}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1 gradient-text">{phase.name}</h3>
                <p className="text-sm text-muted-foreground">{phase.description}</p>
              </div>
              <div className="ml-2">
                {phase.status === "completed" && (
                  <CheckCircle2 className="w-6 h-6 text-success animate-fade-in" />
                )}
                {phase.status === "active" && (
                  <Clock className="w-6 h-6 text-primary animate-pulse" />
                )}
                {phase.status === "pending" && (
                  <Circle className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{phase.progress}%</span>
              </div>
              <div className="w-full glass rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full smooth-transition rounded-full",
                    phase.status === "completed" ? "bg-gradient-to-r from-success to-success" : "bg-gradient-to-r from-primary to-accent glow"
                  )}
                  style={{ width: `${phase.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <Badge variant={phase.status === "completed" ? "default" : phase.status === "active" ? "secondary" : "outline"}>
                  {phase.tasks} tasks
                </Badge>
                <span className="text-xs text-muted-foreground capitalize">
                  {phase.status}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
