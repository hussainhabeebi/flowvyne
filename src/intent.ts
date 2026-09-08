import type { Env } from "./types";

export type Intent = "flow" | "product_query" | "general";

/**
 * Classify the customer message so we can route it correctly:
 *  flow          → user wants to start a scripted process (book, register, complain, etc.)
 *  product_query → asking about specific products, prices, availability, catalog
 *  general       → greeting, thanks, vague question — Flowvyne AI can answer
 *
 * Returns "general" on any error so we never hard-fail.
 */
export async function detectIntent(env: Env, message: string): Promise<Intent> {
  try {
    const result = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `You are a message intent classifier. Classify the customer message into exactly one category.

FLOW      - The customer wants to START a process: book, register, schedule, apply, order, complain, get support, request a quote, etc.
PRODUCT   - The customer is asking about specific products, services, prices, availability, menu items, or catalog details.
GENERAL   - Greeting, thanks, small talk, or a vague question with no clear intent.

Rules:
- Reply with exactly one word: FLOW, PRODUCT, or GENERAL
- If uncertain between FLOW and PRODUCT, choose PRODUCT
- Never explain your answer`,
        },
        { role: "user", content: message.slice(0, 300) },
      ],
      max_tokens: 5,
    })) as { response: string };

    const r = result.response?.trim().toUpperCase() ?? "";
    if (r.startsWith("FLOW")) return "flow";
    if (r.startsWith("PRODUCT")) return "product_query";
    return "general";
  } catch {
    return "general";
  }
}
