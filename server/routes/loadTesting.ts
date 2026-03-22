import { Request, Response } from "express";
import { randomUUID } from "crypto";

// ─── Session registry (maps sessionId → abort controller) ─────────────────────
const activeSessions = new Map<string, AbortController>();

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "curl/7.88.1",
  "python-requests/2.31.0",
  "Go-http-client/2.0",
  "axios/1.6.2",
  "Java/17.0.9",
];

const ACCEPT_HEADERS = [
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "application/json, text/plain, */*",
  "*/*",
  "application/json",
];

const METHODS = ["GET", "GET", "GET", "GET", "HEAD", "HEAD"];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildUrl(base: string, attackMode: boolean): string {
  if (!attackMode) return base;
  try {
    const u = new URL(base);
    u.searchParams.set("_cb", Math.random().toString(36).slice(2));
    u.searchParams.set("_t", Date.now().toString());
    return u.toString();
  } catch {
    return base;
  }
}

interface RequestResult {
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}

async function performRequest(
  url: string,
  attackMode: boolean,
  timeoutMs: number,
  sessionSignal: AbortSignal
): Promise<RequestResult> {
  const startTime = Date.now();
  const requestController = new AbortController();
  const timer = setTimeout(() => requestController.abort(), timeoutMs);

  // Abort request immediately if session is stopped
  const onSessionAbort = () => requestController.abort();
  sessionSignal.addEventListener("abort", onSessionAbort, { once: true });

  const headers: Record<string, string> = attackMode
    ? {
        "User-Agent": randomItem(USER_AGENTS),
        "Accept": randomItem(ACCEPT_HEADERS),
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Connection": "keep-alive",
        "X-Forwarded-For": `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        "X-Real-IP": `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        "Referer": `https://www.google.com/search?q=${Math.random().toString(36).slice(2)}`,
      }
    : {
        "User-Agent": "StressTest/2.0 (Load Testing Tool)",
        "Accept": "*/*",
        "Connection": "keep-alive",
      };

  const method = attackMode ? randomItem(METHODS) : "GET";
  const targetUrl = buildUrl(url, attackMode);

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      signal: requestController.signal,
    });
    clearTimeout(timer);
    sessionSignal.removeEventListener("abort", onSessionAbort);
    return {
      success: response.ok,
      responseTime: Date.now() - startTime,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error: any) {
    clearTimeout(timer);
    sessionSignal.removeEventListener("abort", onSessionAbort);
    const wasSessionAborted = sessionSignal.aborted;
    return {
      success: false,
      responseTime: Date.now() - startTime,
      error: wasSessionAborted
        ? "EMERGENCY STOP — test aborted"
        : error?.name === "AbortError"
        ? `Timed out after ${timeoutMs}ms`
        : error?.message || "Network error",
    };
  }
}

async function runTest(
  url: string,
  totalRequests: number,
  concurrentRequests: number,
  attackMode: boolean,
  timeoutMs: number,
  sessionSignal: AbortSignal,
  onProgress: (sent: number, completed: number) => void
) {
  const results: RequestResult[] = [];
  const errors: string[] = [];
  const testStartTime = Date.now();
  let sent = 0;

  const worker = async () => {
    while (true) {
      // Stop immediately if emergency stop was hit
      if (sessionSignal.aborted) return;

      const myIndex = sent++;
      if (myIndex >= totalRequests) return;

      const result = await performRequest(url, attackMode, timeoutMs, sessionSignal);
      results.push(result);

      if (!result.success && result.error && errors.length < 100) {
        errors.push(`#${myIndex + 1}: ${result.error}`);
      }

      onProgress(Math.min(sent, totalRequests), results.length);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrentRequests, totalRequests) },
    worker
  );
  await Promise.all(workers);

  const totalDuration = (Date.now() - testStartTime) / 1000;
  const successfulRequests = results.filter((r) => r.success).length;
  const failedRequests = results.length - successfulRequests;
  const responseTimes = results.map((r) => r.responseTime);
  const avgResponseTime =
    responseTimes.reduce((a, b) => a + b, 0) / (responseTimes.length || 1);

  const statusCodes: Record<string, number> = {};
  results.forEach((r) => {
    const code = r.statusCode ? String(r.statusCode) : "network_error";
    statusCodes[code] = (statusCodes[code] || 0) + 1;
  });

  return {
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    averageResponseTime: Math.round(avgResponseTime),
    minResponseTime: responseTimes.length ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length ? Math.max(...responseTimes) : 0,
    requestsPerSecond: Number((results.length / (totalDuration || 1)).toFixed(2)),
    totalDurationSeconds: Number(totalDuration.toFixed(2)),
    successRate: Number(
      ((successfulRequests / (results.length || 1)) * 100).toFixed(1)
    ),
    statusCodes,
    errors: errors.slice(0, 100),
    attackMode,
    aborted: sessionSignal.aborted,
  };
}

// ─── Abort endpoint ────────────────────────────────────────────────────────────
export function abortLoadTest(req: Request, res: Response) {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const controller = activeSessions.get(sessionId);
  if (!controller) {
    return res.status(404).json({ error: "Session not found or already completed" });
  }

  controller.abort();
  activeSessions.delete(sessionId);
  return res.json({ ok: true, message: "Test aborted" });
}

// ─── Main load test handler (SSE streaming) ───────────────────────────────────
export async function loadTesting(req: Request, res: Response) {
  const { url, totalRequests, concurrentRequests, attackMode } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  const isAttack = Boolean(attackMode);
  const maxTotal = isAttack ? 50000 : 10000;
  const maxConcurrent = isAttack ? 2000 : 500;
  const timeoutMs = isAttack ? 5000 : 30000;

  const safeTotal = Math.min(Math.max(1, totalRequests || 100), maxTotal);
  const safeConcurrent = Math.min(
    Math.max(1, concurrentRequests || 10),
    maxConcurrent
  );

  if (safeConcurrent > safeTotal) {
    return res
      .status(400)
      .json({ error: "Concurrent requests cannot exceed total requests" });
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sessionId = randomUUID();
  const controller = new AbortController();
  activeSessions.set(sessionId, controller);

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send session ID immediately so client can abort if needed
  send({ type: "session", sessionId });

  // If client disconnects, abort the test automatically
  req.on("close", () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
    activeSessions.delete(sessionId);
  });

  // Throttle progress updates (max once per 200ms)
  let lastProgressSent = 0;
  const onProgress = (sent: number, completed: number) => {
    const now = Date.now();
    if (now - lastProgressSent < 200) return;
    lastProgressSent = now;
    const pct = Math.min(95, Math.round((completed / safeTotal) * 95));
    send({
      type: "progress",
      progress: pct,
      sent,
      completed,
      message: controller.signal.aborted
        ? "Emergency stop — collecting results..."
        : isAttack
        ? `Flooding: ${completed.toLocaleString()} / ${safeTotal.toLocaleString()} requests`
        : `Testing: ${completed.toLocaleString()} / ${safeTotal.toLocaleString()} requests`,
    });
  };

  try {
    const results = await runTest(
      url,
      safeTotal,
      safeConcurrent,
      isAttack,
      timeoutMs,
      controller.signal,
      onProgress
    );

    send({ type: "progress", progress: 100, message: results.aborted ? "Emergency stopped — partial results" : "Complete" });
    send({ type: "result", ...results });
  } catch (error: any) {
    send({ type: "error", message: error?.message || "Load test failed" });
  } finally {
    activeSessions.delete(sessionId);
    if (!res.writableEnded) res.end();
  }
}
