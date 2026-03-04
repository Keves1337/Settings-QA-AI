import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { translateToHebrew } from "./routes/translate";
import { generateTestCases } from "./routes/generateTestCases";
import { generateTasks } from "./routes/generateTasks";
import { analyzeProjectQA } from "./routes/analyzeProjectQA";
import { fuzzTesting } from "./routes/fuzzTesting";
import { loadTesting } from "./routes/loadTesting";
import { generateTestReport } from "./routes/generateTestReport";
import { syncJira } from "./routes/syncJira";
import { syncGithub } from "./routes/syncGithub";
import { captureScreenshot } from "./routes/captureScreenshot";

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
app.post("/api/generate-test-report", generateTestReport);
app.post("/api/sync-jira", syncJira);
app.post("/api/sync-github", syncGithub);
app.post("/api/capture-screenshot", captureScreenshot);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
