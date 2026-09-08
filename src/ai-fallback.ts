import type { Env } from "./types";

export async function callAI(env: Env, prompt: string): Promise<string> {
  const result = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 512,
  })) as { response: string };
  return result.response ?? "";
}
