import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Timer,
  TrendingUp,
  Wifi,
  FlameKindling,
  Skull,
  ShieldOff,
  Shuffle,
  OctagonX,
  ShieldAlert,
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
  attackMode: boolean;
  aborted?: boolean;
}

const NORMAL_PRESETS = [
  { label: "Light", total: 50, concurrent: 5, desc: "Warm-up" },
  { label: "Medium", total: 500, concurrent: 25, desc: "Standard" },
  { label: "Heavy", total: 2000, concurrent: 100, desc: "High stress" },
  { label: "Extreme", total: 10000, concurrent: 500, desc: "Max normal" },
];

const DDOS_PRESETS = [
  { label: "Burst", total: 5000, concurrent: 500, desc: "Quick surge" },
  { label: "Flood", total: 15000, concurrent: 1000, desc: "Sustained flood" },
  { label: "Storm", total: 30000, concurrent: 1500, desc: "Heavy storm" },
  { label: "Nuke", total: 50000, concurrent: 2000, desc: "Maximum force" },
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
  const [attackMode, setAttackMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [results, setResults] = useState<LoadTestResult | null>(null);
  const [wasStopped, setWasStopped] = useState(false);

  const fetchControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  const maxTotal = attackMode ? 50000 : 10000;
  const maxConcurrent = attackMode ? 2000 : 500;
  const presets = attackMode ? DDOS_PRESETS : NORMAL_PRESETS;

  const toggleAttackMode = (val: boolean) => {
    setAttackMode(val);
    if (val) {
      setTotalRequests(15000);
      setConcurrentRequests(1000);
    } else {
      setTotalRequests(500);
      setConcurrentRequests(25);
    }
    setResults(null);
    setWasStopped(false);
  };

  const applyPreset = (p: (typeof NORMAL_PRESETS)[0]) => {
    setTotalRequests(p.total);
    setConcurrentRequests(p.concurrent);
  };

  // ── Emergency Stop ──────────────────────────────────────────────────────────
  const emergencyStop = useCallback(async () => {
    setProgressMsg("⛔ Emergency stop triggered — aborting...");

    // 1. Tell the server to abort (fire and forget)
    const sid = sessionIdRef.current;
    if (sid) {
      fetch("/api/load-testing/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {});
      sessionIdRef.current = null;
    }

    // 2. Cancel the client-side fetch (severs SSE stream)
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
      fetchControllerRef.current = null;
    }

    setWasStopped(true);
    setIsRunning(false);
    setProgress(0);
    toast({
      title: "⛔ Emergency Stop",
      description: "Test aborted. Partial results may be shown.",
      variant: "destructive",
    });
  }, [toast]);

  // ── Start Test ──────────────────────────────────────────────────────────────
  const startTest = async () => {
    if (!url) {
      toast({
        title: "URL Required",
        description: "Enter a target URL",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    setProgress(2);
    setResults(null);
    setWasStopped(false);
    setProgressMsg(attackMode ? "Initializing attack..." : "Starting test...");

    const controller = new AbortController();
    fetchControllerRef.current = controller;
    sessionIdRef.current = null;

    try {
      const response = await fetch("/api/load-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          totalRequests,
          concurrentRequests,
          attackMode,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: LoadTestResult | null = null;

      if (reader) {
        let done = false;
        while (!done) {
          const chunk = await reader.read();
          if (chunk.done) break;

          buffer += decoder.decode(chunk.value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;

            try {
              const msg = JSON.parse(line.slice(6));

              if (msg.type === "session") {
                sessionIdRef.current = msg.sessionId;
              } else if (msg.type === "progress") {
                setProgress(msg.progress ?? 0);
                setProgressMsg(msg.message ?? "");
              } else if (msg.type === "result") {
                finalResult = msg as LoadTestResult;
                done = true;
              } else if (msg.type === "error") {
                throw new Error(msg.message);
              }
            } catch {
              // ignore parse errors for partial lines
            }
          }
        }
      }

      if (finalResult) {
        setResults(finalResult);
        setProgress(100);
        setProgressMsg("Complete");
        setWasStopped(Boolean(finalResult.aborted));
        toast({
          title: finalResult.aborted
            ? "⛔ Test Stopped (partial results)"
            : attackMode
            ? "Attack Complete"
            : "Test Complete",
          description: `${finalResult.totalRequests.toLocaleString()} requests — ${finalResult.successRate}% success`,
          variant: finalResult.aborted ? "destructive" : "default",
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // Client aborted — already handled by emergencyStop()
        return;
      }
      setProgress(0);
      setProgressMsg("");
      toast({
        title: "Test Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      fetchControllerRef.current = null;
      sessionIdRef.current = null;
      setIsRunning(false);
    }
  };

  const successColor = (rate: number) =>
    rate >= 90
      ? "text-green-500"
      : rate >= 60
      ? "text-yellow-500"
      : "text-destructive";

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                attackMode ? "bg-red-500/10" : "bg-primary/10"
              }`}
            >
              {attackMode ? (
                <Skull className="h-5 w-5 text-red-500" />
              ) : (
                <FlameKindling className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {attackMode ? "DDoS Attack Mode" : "Load / Stress Test"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {attackMode
                  ? "Up to 50,000 requests · 2,000 concurrent · Randomized headers & IPs · 5s timeout"
                  : "Up to 10,000 requests · 500 concurrent · 30s timeout"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <ShieldOff
                className={`h-4 w-4 ${
                  attackMode ? "text-red-500" : "text-muted-foreground"
                }`}
              />
              <Label
                htmlFor="attack-mode"
                className={`text-sm font-medium ${attackMode ? "text-red-500" : ""}`}
              >
                DDoS Mode
              </Label>
              <Switch
                id="attack-mode"
                checked={attackMode}
                onCheckedChange={toggleAttackMode}
                disabled={isRunning}
                data-testid="switch-attack-mode"
                className={attackMode ? "data-[state=checked]:bg-red-500" : ""}
              />
            </div>
          </div>
        </div>

        {attackMode && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="text-xs text-red-400 space-y-0.5">
              <p className="font-semibold">Aggressive Attack Mode Active</p>
              <p>
                Rotates 13 different user-agents, randomizes IPs, cache-busts
                every request, and uses a sliding-window concurrency model for
                maximum throughput. Only test targets you own.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="test-url" className="text-sm font-medium">
              Target URL
            </Label>
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
                  data-testid={`button-sample-${s.label.toLowerCase()}`}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              {attackMode && <Shuffle className="h-3.5 w-3.5 text-red-400" />}
              {attackMode ? "Attack Presets" : "Presets"}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  disabled={isRunning}
                  data-testid={`button-preset-${p.label.toLowerCase()}`}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    attackMode
                      ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40"
                      : "border-border bg-muted/40 hover:bg-muted hover:border-primary/50"
                  }`}
                >
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {p.desc}
                  </span>
                  <span
                    className={`text-xs mt-1 font-mono ${
                      attackMode ? "text-red-400" : "text-primary"
                    }`}
                  >
                    {p.total.toLocaleString()} / {p.concurrent.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="total-requests" className="text-sm font-medium">
                Total Requests
              </Label>
              <Input
                id="total-requests"
                data-testid="input-total-requests"
                type="number"
                min="1"
                max={maxTotal}
                value={totalRequests}
                onChange={(e) =>
                  setTotalRequests(
                    Math.min(maxTotal, Math.max(1, parseInt(e.target.value) || 1))
                  )
                }
                disabled={isRunning}
                className={attackMode ? "border-red-500/30 focus-visible:ring-red-500/30" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Max {maxTotal.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concurrent-requests" className="text-sm font-medium">
                Concurrent
              </Label>
              <Input
                id="concurrent-requests"
                data-testid="input-concurrent-requests"
                type="number"
                min="1"
                max={maxConcurrent}
                value={concurrentRequests}
                onChange={(e) =>
                  setConcurrentRequests(
                    Math.min(maxConcurrent, Math.max(1, parseInt(e.target.value) || 1))
                  )
                }
                disabled={isRunning}
                className={attackMode ? "border-red-500/30 focus-visible:ring-red-500/30" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Max {maxConcurrent.toLocaleString()}
              </p>
            </div>
          </div>

          {/* ── Launch / Emergency Stop buttons ──────────────────────────── */}
          <div className="space-y-3">
            {!isRunning ? (
              <Button
                onClick={startTest}
                className={`w-full gap-2 ${
                  attackMode ? "bg-red-600 hover:bg-red-700 text-white" : ""
                }`}
                data-testid="button-start-test"
              >
                {attackMode ? (
                  <Skull className="w-4 h-4" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {attackMode
                  ? `Launch DDoS Attack (${totalRequests.toLocaleString()} req)`
                  : `Launch Stress Test (${totalRequests.toLocaleString()} req)`}
              </Button>
            ) : (
              /* ── EMERGENCY STOP BUTTON ─────────────────────────────────── */
              <div className="space-y-2">
                <button
                  onClick={emergencyStop}
                  data-testid="button-emergency-stop"
                  className="relative w-full overflow-hidden rounded-xl border-2 border-red-500 bg-red-600 px-6 py-4 text-white font-black text-lg tracking-widest uppercase transition-all hover:bg-red-500 active:scale-95 focus:outline-none focus:ring-4 focus:ring-red-500/50"
                  style={{
                    boxShadow: "0 0 32px rgba(239,68,68,0.6), 0 0 64px rgba(239,68,68,0.25)",
                    animation: "pulse-glow 1.5s ease-in-out infinite",
                  }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    <OctagonX className="w-6 h-6" />
                    ⛔ EMERGENCY STOP
                    <OctagonX className="w-6 h-6" />
                  </span>
                  {/* animated scanline overlay */}
                  <span
                    className="pointer-events-none absolute inset-0 opacity-10"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 4px)",
                    }}
                  />
                </button>
                <p className="text-center text-xs text-red-400/70">
                  Immediately cuts all connections and halts the test
                </p>
              </div>
            )}
          </div>

          {/* ── Progress bar ─────────────────────────────────────────────── */}
          {isRunning && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className={attackMode ? "text-red-400" : ""}>{progressMsg}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress
                value={progress}
                className={`h-2 ${attackMode ? "[&>div]:bg-red-500" : ""}`}
              />
            </div>
          )}
        </div>
      </Card>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {results && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">Results</h2>
              {results.attackMode && (
                <Badge
                  variant="outline"
                  className="text-xs border-red-500/30 text-red-400"
                >
                  DDoS Mode
                </Badge>
              )}
              {results.aborted && (
                <Badge
                  variant="outline"
                  className="text-xs border-orange-500/40 text-orange-400 gap-1"
                >
                  <ShieldAlert className="w-3 h-3" />
                  Emergency Stopped — Partial Results
                </Badge>
              )}
              {wasStopped && (
                <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/8 px-3 py-1.5 text-xs text-orange-400">
                  <OctagonX className="w-3.5 h-3.5" />
                  Test was manually stopped. Results below are partial.
                </div>
              )}
            </div>
            <Badge
              variant="outline"
              className={`text-sm font-bold ${successColor(results.successRate)}`}
              data-testid="badge-success-rate"
            >
              {results.successRate}% success
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            <div
              className="rounded-lg border border-border bg-muted/30 p-4"
              data-testid="stat-total"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Sent</span>
              </div>
              <p className="text-2xl font-bold">
                {results.totalRequests.toLocaleString()}
              </p>
            </div>

            <div
              className="rounded-lg border border-green-500/20 bg-green-500/5 p-4"
              data-testid="stat-success"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs text-muted-foreground">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-500">
                {results.successfulRequests.toLocaleString()}
              </p>
            </div>

            <div
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              data-testid="stat-failed"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <XCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs text-muted-foreground">
                  Failed / Blocked
                </span>
              </div>
              <p className="text-2xl font-bold text-destructive">
                {results.failedRequests.toLocaleString()}
              </p>
            </div>

            <div
              className="rounded-lg border border-border bg-muted/30 p-4"
              data-testid="stat-avg"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Avg Response</span>
              </div>
              <p className="text-2xl font-bold">{results.averageResponseTime}ms</p>
            </div>

            <div
              className="rounded-lg border border-border bg-muted/30 p-4"
              data-testid="stat-minmax"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Min / Max</span>
              </div>
              <p className="text-lg font-bold">
                {results.minResponseTime}ms{" "}
                <span className="text-muted-foreground">/</span>{" "}
                {results.maxResponseTime}ms
              </p>
            </div>

            <div
              className="rounded-lg border border-border bg-muted/30 p-4"
              data-testid="stat-rps"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Req / sec</span>
              </div>
              <p className="text-2xl font-bold">
                {results.requestsPerSecond.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {results.totalDurationSeconds}s total
              </p>
            </div>
          </div>

          {Object.keys(results.statusCodes).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Response Breakdown
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(results.statusCodes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => (
                    <Badge
                      key={code}
                      variant="outline"
                      className={`font-mono text-xs ${
                        code.startsWith("2")
                          ? "border-green-500/30 text-green-400"
                          : code.startsWith("4")
                          ? "border-yellow-500/30 text-yellow-400"
                          : code.startsWith("5")
                          ? "border-red-500/30 text-red-400"
                          : "border-border"
                      }`}
                      data-testid={`badge-code-${code}`}
                    >
                      {code}: {count.toLocaleString()}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {results.errors.length > 0 && (
            <div>
              <Separator className="mb-4" />
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm font-semibold">
                  Error Log{" "}
                  <span className="font-normal text-muted-foreground">
                    ({results.errors.length} shown)
                  </span>
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                {results.errors.map((e, i) => (
                  <p
                    key={i}
                    className="font-mono text-xs text-muted-foreground"
                    data-testid={`error-${i}`}
                  >
                    {e}
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Pulse glow animation */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 24px rgba(239,68,68,0.5), 0 0 48px rgba(239,68,68,0.2); }
          50% { box-shadow: 0 0 40px rgba(239,68,68,0.8), 0 0 80px rgba(239,68,68,0.4); }
        }
      `}</style>
    </div>
  );
};
