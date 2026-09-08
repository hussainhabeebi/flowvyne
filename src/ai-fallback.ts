import type { Env, ExecuteInput } from "./types";

export async function callAI(
  env: Env,
  input: ExecuteInput,
  extraContext?: string // mid-flow context (what node the user was on, etc.)
): Promise<string> {
  const systemParts: string[] = [
    "You are a helpful assistant representing this business.",
  ];

  if (input.system_context) {
    systemParts.push(`Business context:\n${input.system_context}`);
  }

  if (input.contact_name) {
    systemParts.push(`You are speaking with ${input.contact_name}.`);
  }

  if (extraContext) {
    systemParts.push(extraContext);
  }

  systemParts.push(
    "Answer the user's question helpfully and concisely.",
    "If the question is outside the scope of this business, politely say so.",
    "Do not make up prices, products, or policies not mentioned in the business context."
  );

  const history = (input.recent_history ?? []).slice(-6).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.text,
  }));

  const result = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: systemParts.join("\n\n") },
      ...history,
      { role: "user", content: input.message_text },
    ],
    max_tokens: 512,
  })) as { response: string };

  return result.response?.trim() ?? "I'm not sure how to help with that right now.";
}
