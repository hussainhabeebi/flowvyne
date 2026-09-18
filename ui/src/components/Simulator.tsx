import { useState } from "react";
import { X, Send } from "lucide-react";
import { useFlowStore } from "../store/flowStore";
import { canvasToFlowJson } from "../utils/serialize";

type Message = {
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  buttons?: { label: string; value: string }[];
};

type Props = { onClose: () => void };

export function Simulator({ onClose }: Props) {
  const { nodes, edges, flowMeta } = useFlowStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<{
    current_node: string | null;
    variables: Record<string, string>;
  }>({ current_node: null, variables: {} });
  const [isLoading, setIsLoading] = useState(false);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const flowJson = canvasToFlowJson(nodes, edges);

      const resp = await fetch("/execute/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": "simulate",
          "X-Simulate-Flow-Id": flowMeta?.id ?? "preview",
        },
        body: JSON.stringify({
          tenant_id: "simulate",
          contact_id: "preview-user",
          message_text: text,
          current_node: state.current_node,
          variables: state.variables,
        }),
      });

      // For simulate we run locally against the flow JSON without hitting DB
      // Fall back to local executor if endpoint not available
      const result = resp.ok
        ? await resp.json()
        : localSimulate(flowJson, state.current_node, text, state.variables);

      setState({ current_node: result.next_node ?? null, variables: result.variables ?? state.variables });

      if (result.reply_text || result.reply_buttons) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: result.reply_text ?? "",
            imageUrl: result.reply_image_url,
            buttons: result.reply_buttons,
          },
        ]);
      }

      if (result.kind === "end") {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "— Flow ended —" },
        ]);
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${String(err)}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setState({ current_node: null, variables: {} });
  };

  return (
    <div className="absolute bottom-6 left-6 z-20 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-brand-500 text-white">
        <span className="font-semibold text-sm">Simulator</span>
        <div className="flex gap-2">
          <button onClick={reset} className="text-white/70 hover:text-white text-xs underline">
            Reset
          </button>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-h-80 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center pt-4">
            Send a trigger keyword to start the flow…
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-brand-500 text-white"
                  : "bg-white border border-slate-200 text-slate-800"
              }`}
            >
              {msg.text && <p>{msg.text}</p>}
              {msg.imageUrl && (
                <img
                  src={msg.imageUrl}
                  alt="Message attachment"
                  className="mt-2 max-h-48 w-full rounded-lg object-contain"
                />
              )}
              {msg.buttons && (
                <div className="mt-2 space-y-1">
                  {msg.buttons.map((btn, j) => (
                    <button
                      key={j}
                      onClick={() => send(btn.value)}
                      className="block w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-400 text-sm animate-pulse">
              …
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Type a message…"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
        <button
          onClick={() => send(input)}
          className="text-brand-500 hover:text-brand-700"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Variable debug */}
      {Object.keys(state.variables).length > 0 && (
        <div className="px-3 pb-3">
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Variables</summary>
            <pre className="mt-1 bg-slate-50 rounded p-2 text-slate-600 overflow-x-auto">
              {JSON.stringify(state.variables, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Minimal local executor (mirrors src/executor.ts) ──────────────────────

function localSimulate(
  flow: { start_node: string; nodes: Record<string, unknown>[] },
  currentNode: string | null,
  message: string,
  variables: Record<string, string>
) {
  const nodeId = currentNode ?? flow.start_node;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = flow.nodes.find((n: any) => n.id === nodeId) as any;
  if (!node) return { kind: "ai_fallback", reply_text: "(no matching node)", next_node: null, variables };

  const interpolate = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => variables[k] ?? `{{${k}}}`);

  if (node.type === "message") {
    const texts: string[] = [];
    const visited = new Set<string>();
    let imageUrl: string | undefined;
    let messageNode = node;

    for (let hops = 0; hops < 10; hops += 1) {
      if (visited.has(messageNode.id)) {
        return { kind: "reply", reply_text: texts.join("\n\n"), reply_image_url: imageUrl, next_node: messageNode.id, variables };
      }
      visited.add(messageNode.id);
      texts.push(interpolate(messageNode.data.text));
      if (messageNode.data.image_url) imageUrl = messageNode.data.image_url;

      const nextNode = flow.nodes.find((n: any) => n.id === messageNode.next) as any;
      if (nextNode?.type === "message") {
        messageNode = nextNode;
        continue;
      }
      if (nextNode?.type === "menu") {
        texts.push(interpolate(nextNode.data.text));
        return { kind: "reply", reply_text: texts.join("\n\n"), reply_image_url: imageUrl, reply_buttons: nextNode.data.options, next_node: nextNode.id, variables };
      }
      if (nextNode?.type === "capture") {
        texts.push(interpolate(nextNode.data.prompt));
        return { kind: "reply", reply_text: texts.join("\n\n"), reply_image_url: imageUrl, next_node: nextNode.id, variables };
      }
      return { kind: "reply", reply_text: texts.join("\n\n"), reply_image_url: imageUrl, next_node: messageNode.next, variables };
    }

    return { kind: "reply", reply_text: texts.join("\n\n"), reply_image_url: imageUrl, next_node: messageNode.id, variables };
  }
  if (node.type === "menu") {
    const msg = message.trim().toLowerCase();
    const matched = node.data.options.find(
      (o: { value: string; label: string; next: string }, i: number) =>
        o.value.toLowerCase() === msg || o.label.toLowerCase() === msg || String(i + 1) === msg
    );
    if (matched) {
      const updatedVariables = matched.store_as
        ? { ...variables, [matched.store_as]: matched.value }
        : variables;
      return localSimulate(flow, matched.next, "", updatedVariables);
    }
    return { kind: "reply", reply_text: interpolate(node.data.text), reply_buttons: node.data.options, next_node: nodeId, variables };
  }
  if (node.type === "capture") {
    if (!message.trim()) {
      return { kind: "reply", reply_text: interpolate(node.data.prompt), next_node: nodeId, variables };
    }
    if (node.data.mode === "structured") {
      const parsed = parseStructured(message, node.data.fields, variables);
      const updatedVariables = { ...variables };
      for (const field of node.data.fields) {
        const value = parsed[field.variable]?.trim();
        if (value && isValidCapture(value, field.validation)) updatedVariables[field.variable] = value;
      }
      const pending = pendingFields(node.data.fields, updatedVariables);
      if (pending.length) {
        return {
          kind: "reply",
          reply_text: `Please provide or correct only these details:\n\n${pending.map((field: any) => `${field.label}:`).join("\n")}`,
          next_node: nodeId,
          variables: updatedVariables,
        };
      }
      for (const field of node.data.fields) {
        if (field.required === false && updatedVariables[field.variable] === undefined) {
          updatedVariables[field.variable] = "";
        }
      }
      return { kind: "reply", next_node: node.next, variables: updatedVariables };
    }
    return { kind: "reply", next_node: node.next, variables: { ...variables, [node.data.variable]: message.trim() } };
  }
  if (node.type === "form") {
    const indexKey = `__fv_form_${node.id}_index`;
    const index = Number.parseInt(variables[indexKey] ?? "0", 10) || 0;
    const field = node.data.fields[index];
    if (!field) return { kind: "reply", reply_text: node.data.success_text, next_node: node.next, variables };
    if (!message.trim()) {
      return { kind: "reply", reply_text: `${node.data.title}\n\n${field.label}`, next_node: node.id, variables };
    }
    const nextVars = { ...variables, [field.variable]: message.trim(), [indexKey]: String(index + 1) };
    const nextField = node.data.fields[index + 1];
    if (nextField) return { kind: "reply", reply_text: nextField.label, next_node: node.id, variables: nextVars };
    delete nextVars[indexKey];
    const success = (node.data.success_text ?? "Thank you. Your form has been submitted.")
      .replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => nextVars[key] ?? `{{${key}}}`);
    return { kind: "reply", reply_text: success, next_node: node.next, variables: nextVars };
  }
  if (node.type === "condition") {
    const left = variables[node.data.variable] ?? "";
    const right = node.data.value;
    const normalizedLeft = left.toLowerCase();
    const normalizedRight = right.toLowerCase();
    const matches = node.data.operator === "eq" ? normalizedLeft === normalizedRight
      : node.data.operator === "neq" ? normalizedLeft !== normalizedRight
      : node.data.operator === "contains" ? normalizedLeft.includes(normalizedRight)
      : node.data.operator === "starts_with" ? normalizedLeft.startsWith(normalizedRight)
      : node.data.operator === "gt" ? Number.parseFloat(left) > Number.parseFloat(right)
      : Number.parseFloat(left) < Number.parseFloat(right);
    return localSimulate(flow, matches ? node.data.true_next : node.data.false_next, "", variables);
  }
  if (node.type === "end") {
    return { kind: "end", variables };
  }
  return { kind: "reply", next_node: null, variables };
}

const CAPTURE_VALIDATORS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[0-9\s\-().]{7,20}$/,
  number: /^-?\d+(\.\d+)?$/,
};

function isValidCapture(value: string, validation?: string): boolean {
  if (!validation || validation === "none") return true;
  return CAPTURE_VALIDATORS[validation]?.test(value) ?? true;
}

function normalizedLabel(value: string): string {
  return value.toLowerCase().replace(/\(optional\)/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function pendingFields(fields: any[], variables: Record<string, string>) {
  return fields.filter((field) => {
    const value = variables[field.variable]?.trim() ?? "";
    return (field.required !== false && !value) || (value !== "" && !isValidCapture(value, field.validation));
  });
}

function parseStructured(message: string, fields: any[], variables: Record<string, string>): Record<string, string> {
  const parsed: Record<string, string> = {};
  let activeField: any;
  for (const rawLine of message.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([^:]{1,100})\s*:\s*(.*)$/);
    if (match) {
      const label = normalizedLabel(match[1]);
      const field = fields.find((candidate) =>
        [candidate.label, ...(candidate.aliases ?? [])].map(normalizedLabel).includes(label)
      );
      if (field) {
        activeField = field;
        parsed[field.variable] = match[2].trim();
        continue;
      }
    }
    if (activeField && rawLine.trim()) {
      parsed[activeField.variable] = `${parsed[activeField.variable]}\n${rawLine.trim()}`.trim();
    }
  }
  const pending = pendingFields(fields, variables);
  if (!Object.keys(parsed).length && pending.length === 1) parsed[pending[0].variable] = message.trim();
  return parsed;
}
