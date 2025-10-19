import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

interface AutomatedTestListProps {
  tests: any[];
}

export const AutomatedTestList = ({ tests }: AutomatedTestListProps) => {
  if (tests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No tests generated yet. Upload your project files to get started.</p>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-4">
      {tests.map((test, index) => (
        <Card key={index} className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{test.title}</h3>
                <Badge variant={getPriorityColor(test.priority)}>
                  {test.priority}
                </Badge>
                <Badge variant="outline">{test.phase}</Badge>
              </div>
              
              <p className="text-sm text-muted-foreground">{test.description}</p>
              
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Test Steps:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 pl-4">
                  {test.steps?.map((step: string, idx: number) => (
                    <li key={idx} className="list-decimal">{step}</li>
                  ))}
                </ol>
              </div>
              
              <div className="bg-muted/50 p-2 rounded text-sm">
                <span className="font-medium">Expected Result: </span>
                <span className="text-muted-foreground">{test.expectedResult}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
