import { Request, Response } from "express";
import OpenAI from "openai";

export async function translateToHebrew(req: Request, res: Response) {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Invalid text parameter" });
  }
  if (text.length > 5000) {
    return res.status(400).json({ error: "Text too long. Maximum 5000 characters" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.json({ translatedText: text, notice: "Translation unavailable — no API key configured." });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional translator. Translate the provided text to Hebrew. Maintain technical terms and code-related terminology appropriately. Return only the translated text without any additional commentary." },
        { role: "user", content: text },
      ],
    });

    const translatedText = response.choices[0]?.message?.content;
    if (!translatedText) return res.status(500).json({ error: "No translation generated" });
    return res.json({ translatedText });
  } catch (error: any) {
    console.error("Translation error:", error);
    if (error?.status === 429) return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
    return res.json({ translatedText: text, notice: "Translation failed — returning original text." });
  }
}
