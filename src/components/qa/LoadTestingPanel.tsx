import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  Timer,
  TrendingUp,
  Wifi,
  FlameKindling,
} from "lucide-react";

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  totalDurationSeconds: number;
  successRate: number;
  statusCodes: Record<string, number>;
  errors: string[];
}

const PRESETS = [
  { label: "Light", total: 50, concurrent: 5, description: "Warm-up test" },
  { label: "Medium", total: 500, concurrent: 25, description: "Standard load" },
  { label: "Heavy", total: 2000, concurrent: 100, description: "High stress" },
  { label: "Extreme", total: 10000, concurrent: 500, description: "DDoS-style" },
];

const SAMPLE_URLS = [
  { label: "httpbin.org", url: "https://httpbin.org/get" },
  { label: "JSONPlaceholder", url: "https://jsonplaceholder.typicode.com/posts/1" },
  { label: "Example.com", url: "https://example.com" },
];

export const LoadTestingPanel = () => {
  const [url, setUrl] = useState("");
  const [totalRequests, setTotalRequests] = useState(500);
  const [concurrentRequests, setConcurrentRequests] = useState(25);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<LoadTestResult | null>(null);
  const { toast } = useToast();

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setTotalRequests(preset.total);
    setConcurrentRequests(preset.concurrent);
  };

  const startLoadTest = async () => {
    if (!url) {
      toast({ title: "URL Required", description: "Enter a target URL", variant: "destructive" });
      return;
    }
    setIsRunning(true);
    setProgress(10);
    setResults(null);

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 8, 92));
    }, 800);

    try {
      const response = await fetch("/api/load-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, totalRequests, concurrentRequests }),
      });
      clearInterval(progressInterval);
      if (!response.ok) throw new Error(await response.text());
      const data: LoadTestResult = await response.json();
      setResults(data);
      setProgress(100);
      toast({
        title: "Test Complete",
        description: `${data.totalRequests.toLocaleString()} requests — ${data.successRate}% success`,
      });
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(0);
      toast({
        title: "Test Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return "text-green-500";
    if (rate >= 70) return "text-yellow-500";
    return "text-destructive";
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <FlameKindling className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Stress / Load Test</h2>
            <p className="text-xs text-muted-foreground">Simulate mass requests — up to 10,000 at 500 concurrent</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="test-url" className="text-sm font-medium">Target URL</Label>
            <Input
              id="test-url"
              data-testid="input-target-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isRunning}
              className="font-mono text-sm"
            />
            <div className="flex gap-2 flex-wrap">
              {SAMPLE_URLS.map((s) => (
                <Button
                  key={s.url}
                  variant="outline"
                  size="sm"
                  onClick={() => setUrl(s.url)}
                  disabled={isRunning}
                  className="text-xs h-7"
                  data-testid={`button-sample-url-${s.label.toLowerCase()}`}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Presets</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  disabled={isRunning}
                  data-testid={`button-preset-${preset.label.toLowerCase()}`}
                  className="flex flex-col items-start rounded-lg border border-border bg-muted/40 p-3 text-left transition-colors hover:bg-muted hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-sm font-semibold">{preset.label}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">{preset.description}</span>
                  <span className="text-xs text-primary mt-1">{preset.total.toLocaleString()} req / {preset.concurrent} con</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total-requests" className="text-sm font-medium">Total Requests</Label>
              <Input
                id="total-requests"
                data-testid="input-total-requests"
                type="number"
                min="1"
                max="10000"
                value={totalRequests}
                onChange={(e) => setTotalRequests(Math.min(10000, Math.max(1, parseInt(e.target.value) || 1)))}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">Max 10,000</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="concurrent-requests" className="text-sm font-medium">Concurrent Requests</Label>
              <Input
                id="concurrent-requests"
                data-testid="input-concurrent-requests"
                type="number"
                min="1"
                max="500"
                value={concurrentRequests}
                onChange={(e) => setConcurrentRequests(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">Max 500 concurrent</p>
            </div>
          </div>

          <Button
            onClick={startLoadTest}
            disabled={isRunning}
            className="w-full gap-2"
            data-testid="button-start-load-test"
          >
            <Zap className="w-4 h-4" />
            {isRunning ? `Testing ${totalRequests.toLocaleString()} requests...` : "Launch Stress Test"}
          </Button>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Sending requests...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>
      </Card>

      {results && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold">Results</h2>
            <Badge
              variant="outline"
              className={`text-sm font-semibold ${getSuccessColor(results.successRate)}`}
            >
              {results.successRate}% success
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="stat-total-requests">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total</span>
              </div>
              <p className="text-2xl font-bold">{results.totalRequests.toLocaleString()}</p>
            </div>

            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4" data-testid="stat-successful">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-500">{results.successfulRequests.toLocaleString()}</p>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4" data-testid="stat-failed">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-xs text-muted-foreground">Failed</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{results.failedRequests.toLocaleString()}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="stat-avg-response">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Avg Response</span>
              </div>
              <p className="text-2xl font-bold">{results.averageResponseTime}ms</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="stat-min-max">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Min / Max</span>
              </div>
              <p className="text-lg font-bold">{results.minResponseTime}ms <span className="text-muted-foreground">/</span> {results.maxResponseTime}ms</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="stat-req-per-sec">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Req / sec</span>
              </div>
              <p className="text-2xl font-bold">{results.requestsPerSecond}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{results.totalDurationSeconds}s total</p>
            </div>
          </div>

          {Object.keys(results.statusCodes).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status Codes</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(results.statusCodes).map(([code, count]) => (
                  <Badge key={code} variant="outline" className="font-mono text-xs" data-testid={`badge-status-${code}`}>
                    {code}: {count.toLocaleString()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {results.errors.length > 0 && (
            <div>
              <Separator className="mb-4" />
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm font-semibold">Error Log <span className="text-muted-foreground font-normal">({results.errors.length} shown)</span></p>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
                {results.errors.map((error, index) => (
                  <p key={index} className="font-mono text-xs text-muted-foreground" data-testid={`error-item-${index}`}>
                    {error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
