import { Request, Response } from "express";

interface RequestResult {
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}

async function performRequest(url: string): Promise<RequestResult> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "StressTest/2.0 (Load Testing Tool)",
        "Accept": "*/*",
        "Connection": "keep-alive",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;
    return {
      success: response.ok,
      responseTime,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error: any) {
    return {
      success: false,
      responseTime: Date.now() - startTime,
      error: error?.name === "AbortError" ? "Request timed out (30s)" : (error?.message || "Network error"),
    };
  }
}

async function runLoadTest(
  url: string,
  totalRequests: number,
  concurrentRequests: number,
  onProgress?: (completed: number) => void
) {
  const results: RequestResult[] = [];
  const errors: string[] = [];
  const testStartTime = Date.now();

  for (let i = 0; i < totalRequests; i += concurrentRequests) {
    const batchSize = Math.min(concurrentRequests, totalRequests - i);
    const batch = Array(batchSize).fill(null).map(() => performRequest(url));
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    batchResults.forEach((result, index) => {
      if (!result.success && result.error) {
        errors.push(`Request ${i + index + 1}: ${result.error}`);
      }
    });
    if (onProgress) onProgress(results.length);
  }

  const totalDuration = (Date.now() - testStartTime) / 1000;
  const successfulRequests = results.filter((r) => r.success).length;
  const failedRequests = results.length - successfulRequests;
  const responseTimes = results.map((r) => r.responseTime);
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  // Status code breakdown
  const statusCodes: Record<string, number> = {};
  results.forEach((r) => {
    const code = r.statusCode ? String(r.statusCode) : "network_error";
    statusCodes[code] = (statusCodes[code] || 0) + 1;
  });

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    averageResponseTime: Math.round(averageResponseTime),
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    requestsPerSecond: Number((totalRequests / totalDuration).toFixed(2)),
    totalDurationSeconds: Number(totalDuration.toFixed(2)),
    successRate: Number(((successfulRequests / totalRequests) * 100).toFixed(1)),
    statusCodes,
    errors: errors.slice(0, 50),
  };
}

export async function loadTesting(req: Request, res: Response) {
  const { url, totalRequests, concurrentRequests } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  const safeTotal = Math.min(totalRequests || 100, 10000);
  const safeConcurrent = Math.min(concurrentRequests || 10, 500);

  if (safeTotal < 1) return res.status(400).json({ error: "Total requests must be at least 1" });
  if (safeConcurrent < 1) return res.status(400).json({ error: "Concurrent requests must be at least 1" });
  if (safeConcurrent > safeTotal) return res.status(400).json({ error: "Concurrent requests cannot exceed total requests" });

  try {
    const results = await runLoadTest(url, safeTotal, safeConcurrent);
    return res.json(results);
  } catch (error: any) {
    console.error("Load test error:", error);
    return res.status(500).json({ error: error?.message || "Load test failed" });
  }
}
