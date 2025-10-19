import { Card } from "@/components/ui/card";
import { TrendingUp, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string | number;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: "progress" | "completed" | "active" | "blocked";
}

interface StatsCardsProps {
  stats: Stat[];
}

const iconMap = {
  progress: TrendingUp,
  completed: CheckCircle2,
  active: Clock,
  blocked: AlertTriangle,
};

const iconColorMap = {
  progress: "text-primary",
  completed: "text-success",
  active: "text-warning",
  blocked: "text-destructive",
};

export const StatsCards = ({ stats }: StatsCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = iconMap[stat.icon];
        const iconColor = iconColorMap[stat.icon];

        return (
          <Card
            key={index}
            className="p-6 transition-all hover:shadow-lg hover:-translate-y-1 animate-fade-in"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-lg bg-gradient-to-br", 
                stat.icon === "completed" && "from-success/10 to-success/5",
                stat.icon === "progress" && "from-primary/10 to-primary/5",
                stat.icon === "active" && "from-warning/10 to-warning/5",
                stat.icon === "blocked" && "from-destructive/10 to-destructive/5"
              )}>
                <Icon className={cn("w-6 h-6", iconColor)} />
              </div>
              <div className={cn(
                "text-sm font-medium flex items-center gap-1",
                stat.trend === "up" && "text-success",
                stat.trend === "down" && "text-destructive",
                stat.trend === "neutral" && "text-muted-foreground"
              )}>
                {stat.trend !== "neutral" && (
                  <TrendingUp className={cn(
                    "w-4 h-4",
                    stat.trend === "down" && "rotate-180"
                  )} />
                )}
                {stat.change}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
