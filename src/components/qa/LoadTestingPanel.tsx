import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errors: string[];
}

export const LoadTestingPanel = () => {
  const [url, setUrl] = useState("");
  const totalRequests = 1000; // Maximum allowed
  const concurrentRequests = 50; // Maximum allowed
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<LoadTestResult | null>(null);
  const { toast } = useToast();

  const startLoadTest = async () => {
    if (!url) {
      toast({
        title: "URL Required",
        description: "Please enter a URL to test",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("load-testing", {
        body: {
          url,
          totalRequests,
          concurrentRequests,
        },
      });

      if (error) throw error;

      setResults(data);
      setProgress(100);
      
      toast({
        title: "Load Test Complete",
        description: `Completed ${data.totalRequests} requests with ${data.successfulRequests} successful`,
      });
    } catch (error) {
      console.error("Load test error:", error);
      toast({
        title: "Load Test Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Load Testing Configuration
        </h2>

        <div className="space-y-4">
          <div>
            <Label htmlFor="test-url">Target URL</Label>
            <Input
              id="test-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="p-4 rounded-lg bg-muted">
            <div className="text-sm text-muted-foreground mb-1">
              Test Configuration (Maximum Load)
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total Requests:</span>
              <span className="text-primary font-bold">1,000</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Concurrent Requests:</span>
              <span className="text-primary font-bold">50</span>
            </div>
          </div>

          <Button 
            onClick={startLoadTest} 
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? "Running Maximum Load Test..." : "Start Maximum Load Test"}
          </Button>

          {isRunning && (
            <div className="space-y-2">
              <Label>Progress</Label>
              <Progress value={progress} />
            </div>
          )}
        </div>
      </Card>

      {results && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Requests</span>
              </div>
              <p className="text-2xl font-bold">{results.totalRequests}</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-500">{results.successfulRequests}</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-muted-foreground">Failed</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{results.failedRequests}</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Avg Response Time</span>
              </div>
              <p className="text-2xl font-bold">{results.averageResponseTime.toFixed(0)}ms</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Min / Max</span>
              </div>
              <p className="text-lg font-bold">{results.minResponseTime}ms / {results.maxResponseTime}ms</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Req/sec</span>
              </div>
              <p className="text-2xl font-bold">{results.requestsPerSecond.toFixed(2)}</p>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <h3 className="font-semibold">Errors</h3>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {results.errors.map((error, index) => (
                  <div key={index} className="p-2 rounded bg-destructive/10 text-sm">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
