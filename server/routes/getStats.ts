import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export async function getProjectStats(req: Request, res: Response) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_project_stats");
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load stats" });
  }
}

export async function getPhaseStats(req: Request, res: Response) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_phase_stats");
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load phase stats" });
  }
}
