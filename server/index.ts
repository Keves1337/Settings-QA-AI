import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env file manually (tsx doesn't auto-load it)
try {
  const envPath = resolve(process.cwd(), ".env");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {}

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { translateToHebrew } from "./routes/translate";
import { generateTestCases } from "./routes/generateTestCases";
import { generateTasks } from "./routes/generateTasks";
import { analyzeProjectQA } from "./routes/analyzeProjectQA";
import { fuzzTesting } from "./routes/fuzzTesting";
import { loadTesting, abortLoadTest } from "./routes/loadTesting";
import { generateTestReport } from "./routes/generateTestReport";
import { syncJira } from "./routes/syncJira";
import { syncGithub } from "./routes/syncGithub";
import { captureScreenshot } from "./routes/captureScreenshot";
import { getProjectStats, getPhaseStats } from "./routes/getStats";

const app = express();
const PORT = process.env.PORT || 3001;

// Required before rate limiter — Replit sits behind a proxy that sets X-Forwarded-For
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: "50mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
app.use("/api", limiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/translate-to-hebrew", translateToHebrew);
app.post("/api/generate-test-cases", generateTestCases);
app.post("/api/generate-tasks", generateTasks);
app.post("/api/analyze-project-qa", analyzeProjectQA);
app.post("/api/fuzz-testing", fuzzTesting);
app.post("/api/load-testing", loadTesting);
app.post("/api/load-testing/abort", abortLoadTest);
app.post("/api/generate-test-report", generateTestReport);
app.post("/api/sync-jira", syncJira);
app.post("/api/sync-github", syncGithub);
app.post("/api/capture-screenshot", captureScreenshot);
app.get("/api/stats", getProjectStats);
app.get("/api/phase-stats", getPhaseStats);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
