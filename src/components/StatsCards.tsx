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

const iconColorMap = {
  progress: "text-primary",
  completed: "text-success",
  active: "text-warning",
  blocked: "text-destructive",
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
                stat.icon === "completed" ? "bg-green-500/20 text-green-400" :
                stat.icon === "progress" ? "bg-primary/20 text-primary" :
                stat.icon === "active" ? "bg-yellow-500/20 text-yellow-400" :
                "bg-red-500/20 text-red-400"
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
