import { useState } from "react";
import { X, Send } from "lucide-react";
import { useFlowStore } from "../store/flowStore";
import { canvasToFlowJson } from "../utils/serialize";

type Message = { role: "user" | "assistant"; text: string; buttons?: { label: string; value: string }[] };

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
    return { kind: "reply", reply_text: interpolate(node.data.text), next_node: node.next, variables };
  }
  if (node.type === "menu") {
    const msg = message.trim().toLowerCase();
    const matched = node.data.options.find(
      (o: { value: string; label: string; next: string }, i: number) =>
        o.value.toLowerCase() === msg || o.label.toLowerCase() === msg || String(i + 1) === msg
    );
    if (matched) return { kind: "reply", next_node: matched.next, variables };
    return { kind: "reply", reply_text: interpolate(node.data.text), reply_buttons: node.data.options, next_node: nodeId, variables };
  }
  if (node.type === "capture") {
    return { kind: "reply", next_node: node.next, variables: { ...variables, [node.data.variable]: message.trim() } };
  }
  if (node.type === "end") {
    return { kind: "end", variables };
  }
  return { kind: "reply", next_node: null, variables };
}
