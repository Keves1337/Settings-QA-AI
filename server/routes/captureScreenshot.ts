import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

export async function captureScreenshot(req: Request, res: Response) {
  const { bugId, screenshotBase64, fileName } = req.body;

  if (!bugId || typeof bugId !== "string") {
    return res.status(400).json({ error: "Invalid bugId" });
  }
  if (!screenshotBase64 || typeof screenshotBase64 !== "string") {
    return res.status(400).json({ error: "Invalid screenshot data" });
  }
  if (screenshotBase64.length > 13500000) {
    return res.status(400).json({ error: "Screenshot too large. Maximum 10MB" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Buffer.from(base64Data, "base64");

    const timestamp = Date.now();
    const sanitizedFileName = fileName
      ? fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
      : `screenshot-${timestamp}.png`;
    const filePath = `bugs/${bugId}/${sanitizedFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("test-reports")
      .upload(filePath, binaryData, { contentType: "image/png", upsert: true });

    if (uploadError) {
      return res.status(500).json({ error: `Failed to upload screenshot: ${uploadError.message}` });
    }

    const { data: urlData } = supabase.storage.from("test-reports").getPublicUrl(filePath);

    const { data: bug, error: bugError } = await supabase
      .from("bugs")
      .select("screenshots")
      .eq("id", bugId)
      .single();

    if (bugError && bugError.code !== "PGRST116") {
      return res.status(500).json({ error: `Failed to fetch bug: ${bugError.message}` });
    }

    const existingScreenshots = (bug as any)?.screenshots || [];
    await supabase
      .from("bugs")
      .update({ screenshots: [...existingScreenshots, urlData.publicUrl] })
      .eq("id", bugId);

    return res.json({ success: true, screenshotUrl: urlData.publicUrl, filePath });
  } catch (error: any) {
    console.error("Screenshot error:", error);
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
