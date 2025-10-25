import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Zap, 
  AlertTriangle, 
  Shield, 
  Bug, 
  Database,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fuzzTestConfigSchema } from "@/lib/validation";
import { z } from "zod";

interface FuzzTest {
  testType: string;
  targetFunction: string;
  input: string;
  expectedBehavior: string;
  severity: string;
  description: string;
  potentialImpact?: string;
}

interface FuzzTestingPanelProps {
  uploadedFiles: File[];
}

export const FuzzTestingPanel = ({ uploadedFiles }: FuzzTestingPanelProps) => {
  const { toast } = useToast();
  const [isFuzzing, setIsFuzzing] = useState(false);
  const [iterations, setIterations] = useState(100);
  const [fuzzResults, setFuzzResults] = useState<{
    fuzzTests: FuzzTest[];
    coverageAreas: string[];
    estimatedBugsFound: number;
  } | null>(null);
  const [progress, setProgress] = useState(0);

  const getTestTypeIcon = (type: string) => {
    const icons: Record<string, any> = {
      boundary: AlertTriangle,
      injection: Shield,
      malformed: Bug,
      concurrent: Activity,
      memory: Database,
      'type-confusion': Zap,
      overflow: AlertTriangle,
    };
    return icons[type] || Bug;
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-500",
      high: "bg-orange-500",
      medium: "bg-yellow-500",
      low: "bg-blue-500",
    };
    return colors[severity] || "bg-gray-500";
  };

  const runFuzzTests = async () => {
    // Validate iterations
    try {
      fuzzTestConfigSchema.parse({ iterations });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0]?.message || "Invalid input",
          variant: "destructive",
        });
        return;
      }
    }

    if (uploadedFiles.length === 0) {
      toast({
        title: "No Files",
        description: "Please upload files first before running fuzz tests",
        variant: "destructive",
      });
      return;
    }

    setIsFuzzing(true);
    setProgress(0);

    try {
      // Read file contents
      const fileContents = await Promise.all(
        uploadedFiles.map(async (file) => {
          const text = await file.text();
          return {
            path: file.name,
            content: text,
          };
        })
      );

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fuzz-testing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            codeFiles: fileContents,
            testConfig: { iterations },
          }),
        }
      );

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to run fuzz tests');
      }

      const data = await response.json();
      setFuzzResults(data);

      toast({
        title: "Fuzzing Complete! 🎯",
        description: `Generated ${data.fuzzTests.length} fuzz tests. Found ${data.estimatedBugsFound || 0} potential issues.`,
      });
    } catch (error: any) {
      console.error('Fuzz testing error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to run fuzz tests",
        variant: "destructive",
      });
    } finally {
      setIsFuzzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Randomized Fuzzing Tests
            </h2>
            <p className="text-muted-foreground">
              Generate random and edge case inputs to discover hidden bugs and vulnerabilities
            </p>
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Test Iterations</label>
              <Input
                type="number"
                min="10"
                max="1000"
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value) || 100)}
                className="mt-1"
                placeholder="Number of random tests to generate"
              />
            </div>
            <Button 
              onClick={runFuzzTests} 
              disabled={isFuzzing || uploadedFiles.length === 0}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              {isFuzzing ? 'Fuzzing...' : 'Start Fuzzing'}
            </Button>
          </div>

          {isFuzzing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Running fuzz tests...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>
      </Card>

      {fuzzResults && (
        <>
          <Card className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">
                  {fuzzResults.fuzzTests.length}
                </div>
                <div className="text-sm text-muted-foreground">Tests Generated</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-500">
                  {fuzzResults.estimatedBugsFound || 0}
                </div>
                <div className="text-sm text-muted-foreground">Potential Bugs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-500">
                  {fuzzResults.coverageAreas.length}
                </div>
                <div className="text-sm text-muted-foreground">Coverage Areas</div>
              </div>
            </div>
          </Card>

          {fuzzResults.coverageAreas.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3">Coverage Areas</h3>
              <div className="flex flex-wrap gap-2">
                {fuzzResults.coverageAreas.map((area, idx) => (
                  <Badge key={idx} variant="secondary">
                    {area}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Fuzz Test Results</h3>
            <div className="space-y-3">
              {fuzzResults.fuzzTests.map((test, idx) => {
                const Icon = getTestTypeIcon(test.testType);
                return (
                  <Card key={idx} className="p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">
                                {test.targetFunction}
                              </span>
                              <Badge className={getSeverityColor(test.severity)}>
                                {test.severity}
                              </Badge>
                              <Badge variant="outline">{test.testType}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {test.description}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium">Input:</span>
                            <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">
                              {test.input.substring(0, 100)}
                              {test.input.length > 100 && '...'}
                            </code>
                          </div>
                          <div>
                            <span className="font-medium">Expected:</span>
                            <span className="ml-2 text-muted-foreground">
                              {test.expectedBehavior}
                            </span>
                          </div>
                          {test.potentialImpact && (
                            <div className="mt-2 p-2 bg-orange-500/10 rounded border border-orange-500/20">
                              <span className="font-medium text-orange-600">Impact:</span>
                              <span className="ml-2 text-sm">
                                {test.potentialImpact}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
