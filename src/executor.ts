import type {
  FlowJSON,
  FlowNode,
  ExecuteInput,
  ExecuteOutput,
  MenuOption,
  ConditionOperator,
} from "./types";

// ── Variable interpolation ────────────────────────────────────────────────

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── Condition evaluation ──────────────────────────────────────────────────

function evaluate(
  left: string,
  op: ConditionOperator,
  right: string
): boolean {
  switch (op) {
    case "eq":
      return left.toLowerCase() === right.toLowerCase();
    case "neq":
      return left.toLowerCase() !== right.toLowerCase();
    case "contains":
      return left.toLowerCase().includes(right.toLowerCase());
    case "starts_with":
      return left.toLowerCase().startsWith(right.toLowerCase());
    case "gt":
      return parseFloat(left) > parseFloat(right);
    case "lt":
      return parseFloat(left) < parseFloat(right);
  }
}

// ── Input validation ──────────────────────────────────────────────────────

const VALIDATORS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[0-9\s\-().]{7,20}$/,
  number: /^-?\d+(\.\d+)?$/,
};

function isValid(value: string, rule: string | undefined): boolean {
  if (!rule || rule === "none") return true;
  return VALIDATORS[rule]?.test(value) ?? true;
}

// ── Node lookup ───────────────────────────────────────────────────────────

function findNode(flow: FlowJSON, id: string): FlowNode | undefined {
  return flow.nodes.find((n) => n.id === id);
}

// ── Main executor ─────────────────────────────────────────────────────────

export function executeFlow(
  flow: FlowJSON,
  input: ExecuteInput
): ExecuteOutput {
  const { message_text, variables } = input;
  const nodeId = input.current_node ?? flow.start_node;
  const node = findNode(flow, nodeId);

  if (!node) {
    return {
      kind: "ai_fallback",
      prompt_context: buildAIContext(input),
    };
  }

  switch (node.type) {
    case "message": {
      const text = interpolate(node.data.text, variables);
      return {
        kind: "reply",
        reply_text: text,
        next_node: node.next,
        variables,
      };
    }

    case "menu": {
      const msg = message_text.trim().toLowerCase();
      const matched = node.data.options.find(
        (o) =>
          o.value.toLowerCase() === msg ||
          o.label.toLowerCase() === msg ||
          // also match the option index (1, 2, 3…)
          String(node.data.options.indexOf(o) + 1) === msg
      );

      if (matched) {
        // User picked a valid option — advance without sending another message
        return {
          kind: "reply",
          next_node: matched.next,
          variables,
        };
      }

      // No match — re-present the menu
      return {
        kind: "reply",
        reply_text: interpolate(node.data.text, variables),
        reply_buttons: node.data.options,
        next_node: nodeId, // stay on this node
        variables,
      };
    }

    case "capture": {
      const trimmed = message_text.trim();

      // No input yet (e.g. auto-advance after a menu selection) — show the prompt
      if (!trimmed) {
        return {
          kind: "reply",
          reply_text: interpolate(node.data.prompt, variables),
          next_node: nodeId,
          variables,
        };
      }

      // If the user is asking a side question rather than answering the prompt,
      // route to AI so the question gets answered while the capture node stays active.
      const isQuestion =
        trimmed.includes("?") ||
        /^(what|when|where|who|why|how|can|could|do|does|did|is|are|was|were|will|would)\b/i.test(trimmed);
      if (isQuestion) {
        return {
          kind: "ai_fallback",
          prompt_context: buildAIContext(input),
        };
      }

      if (!isValid(trimmed, node.data.validation)) {
        const errText =
          node.data.error_text ??
          `That doesn't look like a valid ${node.data.validation}. Please try again.`;
        return {
          kind: "reply",
          reply_text: errText,
          next_node: nodeId, // stay on this node
          variables,
        };
      }

      const updatedVars = { ...variables, [node.data.variable]: trimmed };
      return {
        kind: "reply",
        next_node: node.next,
        variables: updatedVars,
      };
    }

    case "condition": {
      const varValue = variables[node.data.variable] ?? "";
      const branch = evaluate(varValue, node.data.operator, node.data.value)
        ? node.data.true_next
        : node.data.false_next;

      // Conditions are transparent — immediately execute the next node
      return executeFlow(flow, { ...input, current_node: branch });
    }

    case "end": {
      return { kind: "end", variables };
    }
  }
}

// ── AI context builder ────────────────────────────────────────────────────

function buildAIContext(input: ExecuteInput): string {
  const lines: string[] = [
    `You are a helpful assistant. Respond naturally to the user's message.`,
  ];

  if (Object.keys(input.variables).length > 0) {
    lines.push(
      `Known context: ${JSON.stringify(input.variables, null, 2)}`
    );
  }

  if (input.recent_history?.length) {
    lines.push("Recent conversation:");
    for (const turn of input.recent_history.slice(-6)) {
      lines.push(`${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`);
    }
  }

  lines.push(`User: ${input.message_text}`);
  return lines.join("\n");
}
