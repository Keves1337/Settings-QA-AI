import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const getIconBgClasses = (iconType: Stat["icon"]) => {
  switch (iconType) {
    case "completed":
      return "bg-green-500/20 text-green-400";
    case "progress":
      return "bg-primary/20 text-primary";
    case "active":
      return "bg-cyan-500/20 text-cyan-400";
    case "blocked":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-primary/20 text-primary";
  }
};

export const StatsCards = ({ stats }: StatsCardsProps) => {
  const getIcon = (iconType: Stat["icon"]) => {
    const Icon = iconMap[iconType];
    return <Icon className="w-6 h-6" />;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card 
          key={index} 
          className="p-6 hover-glow group animate-fade-in"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold gradient-text">{stat.value}</h3>
                <Badge
                  variant={
                    stat.trend === "up"
                      ? "default"
                      : stat.trend === "down"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs glass"
                >
                  {stat.change}
                </Badge>
              </div>
            </div>
            <div
              className={cn(
                "p-3 rounded-xl glass smooth-transition group-hover:scale-110",
                getIconBgClasses(stat.icon)
              )}
            >
              {getIcon(stat.icon)}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
