import type { Env } from "./types";

type AIResponse = { text: string };

// ── Gemini (preferred when API key is available) ──────────────────────────

async function callGemini(
  apiKey: string,
  prompt: string,
  model = "gemini-1.5-flash"
): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
      }),
    }
  );

  if (!resp.ok) {
    throw new Error(`Gemini error ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? "";
}

// ── Workers AI (fallback when no Gemini key) ──────────────────────────────

async function callWorkersAI(ai: Ai, prompt: string): Promise<string> {
  const result = (await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 512,
  })) as AIResponse;
  return result.text ?? "";
}

// ── Public interface ──────────────────────────────────────────────────────

export async function callAI(env: Env, prompt: string): Promise<string> {
  if (env.GEMINI_API_KEY) {
    try {
      return await callGemini(env.GEMINI_API_KEY, prompt);
    } catch (err) {
      console.error("Gemini failed, falling back to Workers AI:", err);
    }
  }
  return callWorkersAI(env.AI, prompt);
}
