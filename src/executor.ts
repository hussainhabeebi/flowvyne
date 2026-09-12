import type {
  FlowJSON,
  FlowNode,
  ExecuteInput,
  ExecuteOutput,
  ConditionOperator,
  StructuredCaptureField,
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

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(optional\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fieldLabels(field: StructuredCaptureField): string[] {
  return [field.label, ...(field.aliases ?? [])].map(normalizeLabel);
}

function pendingStructuredFields(
  fields: StructuredCaptureField[],
  variables: Record<string, string>
): StructuredCaptureField[] {
  return fields.filter((field) => {
    const value = variables[field.variable]?.trim() ?? "";
    return (field.required !== false && !value) || (value !== "" && !isValid(value, field.validation));
  });
}

function parseStructuredResponse(
  message: string,
  fields: StructuredCaptureField[],
  variables: Record<string, string>
): Record<string, string> {
  const pending = pendingStructuredFields(fields, variables);
  const parsed: Record<string, string> = {};
  let activeField: StructuredCaptureField | undefined;

  for (const rawLine of message.split(/\r?\n/)) {
    const labelMatch = rawLine.match(/^\s*([^:]{1,100})\s*:\s*(.*)$/);
    if (labelMatch) {
      const normalized = normalizeLabel(labelMatch[1]);
      const matched = fields.find((field) => fieldLabels(field).includes(normalized));
      if (matched) {
        activeField = matched;
        parsed[matched.variable] = labelMatch[2].trim();
        continue;
      }
    }

    if (activeField && rawLine.trim()) {
      parsed[activeField.variable] = `${parsed[activeField.variable]}\n${rawLine.trim()}`.trim();
    }
  }

  // A plain answer is unambiguous when only one required/invalid field remains.
  if (Object.keys(parsed).length === 0 && pending.length === 1) {
    parsed[pending[0].variable] = message.trim();
  }

  return parsed;
}

function missingFieldsPrompt(fields: StructuredCaptureField[]): string {
  const lines = fields.map((field) => `${field.label}:`);
  return `Please provide or correct only these details:\n\n${lines.join("\n")}`;
}

function formFieldPrompt(label: string, required: boolean, placeholder?: string, options?: string[]): string {
  const optionText = options?.length ? `\n${options.map((option, i) => `${i + 1}. ${option}`).join("\n")}` : "";
  const hint = placeholder ? `\n${placeholder}` : "";
  const skip = required ? "" : " (reply skip to leave blank)";
  return `${label}${skip}${optionText}${hint}`;
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
      const imageProps = node.data.image_url ? { reply_image_url: node.data.image_url } : {};

      // Auto-advance: peek at the next node. If it's a Menu or Capture, combine outputs
      // so the user sees prompt + options in the same message (no extra user turn required).
      if (node.next) {
        const nextNode = findNode(flow, node.next);

        if (nextNode?.type === "menu") {
          return {
            kind: "reply",
            reply_text: text + "\n\n" + interpolate(nextNode.data.text, variables),
            ...imageProps,
            reply_buttons: nextNode.data.options,
            next_node: nextNode.id, // wait on the menu node
            variables,
          };
        }

        if (nextNode?.type === "capture") {
          return {
            kind: "reply",
            reply_text: text + "\n\n" + interpolate(nextNode.data.prompt, variables),
            ...imageProps,
            next_node: nextNode.id, // wait on the capture node
            variables,
          };
        }


        if (nextNode?.type === "form") {
          const first = nextNode.data.fields[0];
          const intro = [nextNode.data.title, nextNode.data.description].filter(Boolean).join("\n");
          return {
            kind: "reply",
            reply_text: first
              ? `${text}\n\n${intro}\n\n${formFieldPrompt(first.label, first.required !== false, first.placeholder, first.options)}`
              : `${text}\n\n${intro}`,
            ...imageProps,
            next_node: nextNode.id,
            variables,
          };
        }
      }

      return {
        kind: "reply",
        reply_text: text,
        ...imageProps,
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
        // User picked a valid option. Render the destination immediately with
        // empty input so menu values are never consumed as capture answers.
        const updatedVars = matched.store_as
          ? { ...variables, [matched.store_as]: matched.value }
          : variables;
        return executeFlow(flow, {
          ...input,
          message_text: "",
          current_node: matched.next,
          variables: updatedVars,
        });
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

      if (node.data.mode === "structured") {
        const parsed = parseStructuredResponse(trimmed, node.data.fields, variables);
        const updatedVars = { ...variables };

        for (const field of node.data.fields) {
          const value = parsed[field.variable]?.trim();
          if (value && isValid(value, field.validation)) {
            updatedVars[field.variable] = value;
          }
        }

        const pending = pendingStructuredFields(node.data.fields, updatedVars);
        if (pending.length > 0) {
          return {
            kind: "reply",
            reply_text: missingFieldsPrompt(pending),
            next_node: nodeId,
            variables: updatedVars,
          };
        }

        for (const field of node.data.fields) {
          if (field.required === false && updatedVars[field.variable] === undefined) {
            updatedVars[field.variable] = "";
          }
        }

        return {
          kind: "reply",
          next_node: node.next,
          variables: updatedVars,
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

    case "form": {
      const indexKey = `__fv_form_${node.id}_index`;
      const currentIndex = Math.max(0, Number.parseInt(variables[indexKey] ?? "0", 10) || 0);
      const field = node.data.fields[currentIndex];

      if (!field) {
        const cleaned = { ...variables };
        delete cleaned[indexKey];
        return {
          kind: "reply",
          reply_text: interpolate(node.data.success_text ?? "Thank you. Your form has been submitted.", cleaned),
          next_node: node.next,
          variables: cleaned,
          form_submission: {
            form_node_id: node.id,
            form_title: node.data.title,
            values: Object.fromEntries(node.data.fields.map((item) => [item.variable, cleaned[item.variable] ?? ""])),
            sheet_sync: node.data.sheet_sync,
          },
        };
      }

      const trimmed = message_text.trim();
      if (!trimmed) {
        const intro = currentIndex === 0
          ? [node.data.title, node.data.description].filter(Boolean).join("\n")
          : "";
        return {
          kind: "reply",
          reply_text: [intro, formFieldPrompt(field.label, field.required !== false, field.placeholder, field.options)]
            .filter(Boolean).join("\n\n"),
          next_node: nodeId,
          variables,
        };
      }

      const skipped = field.required === false && trimmed.toLowerCase() === "skip";
      let value = skipped ? "" : trimmed;
      if ((field.type === "select" || field.type === "radio") && field.options?.length && !skipped) {
        const option = field.options.find((item, i) =>
          item.toLowerCase() === trimmed.toLowerCase() || String(i + 1) === trimmed
        );
        if (!option) {
          return {
            kind: "reply",
            reply_text: `Please choose one of the available options.\n\n${formFieldPrompt(field.label, true, field.placeholder, field.options)}`,
            next_node: nodeId,
            variables,
          };
        }
        value = option;
      }

      const validation = ["email", "phone", "number"].includes(field.type) ? field.type : "none";
      if (!skipped && !isValid(value, validation)) {
        return {
          kind: "reply",
          reply_text: `That doesn't look like a valid ${field.type}. Please try again.`,
          next_node: nodeId,
          variables,
        };
      }

      const updated = { ...variables, [field.variable]: value, [indexKey]: String(currentIndex + 1) };
      const nextField = node.data.fields[currentIndex + 1];
      if (nextField) {
        return {
          kind: "reply",
          reply_text: formFieldPrompt(nextField.label, nextField.required !== false, nextField.placeholder, nextField.options),
          next_node: nodeId,
          variables: updated,
        };
      }

      delete updated[indexKey];
      return {
        kind: "reply",
        reply_text: interpolate(node.data.success_text ?? "Thank you. Your form has been submitted.", updated),
        next_node: node.next,
        variables: updated,
        form_submission: {
          form_node_id: node.id,
          form_title: node.data.title,
          values: Object.fromEntries(node.data.fields.map((item) => [item.variable, updated[item.variable] ?? ""])),
          sheet_sync: node.data.sheet_sync,
        },
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
