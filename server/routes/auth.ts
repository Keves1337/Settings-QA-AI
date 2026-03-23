import type { Request, Response } from "express";

const VALID_USERNAME = process.env.BQA_USERNAME || "Settings";
const VALID_PASSWORD = process.env.BQA_PASSWORD || "Sqi4hjwq";

export function loginHandler(req: Request, res: Response) {
  const { username, password } = req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.trim() !== VALID_USERNAME ||
    password !== VALID_PASSWORD
  ) {
    res.status(401).json({ ok: false, error: "Invalid credentials" });
    return;
  }

  res.json({ ok: true });
}
