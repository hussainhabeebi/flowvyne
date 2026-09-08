// ── Flow node definitions ──────────────────────────────────────────────────

export type MessageNode = {
  id: string;
  type: "message";
  data: {
    text: string; // supports {{variable}} interpolation
  };
  next: string | null; // null = end
};

export type MenuOption = {
  label: string;
  value: string; // matched against incoming message (case-insensitive)
  next: string;
};

export type MenuNode = {
  id: string;
  type: "menu";
  data: {
    text: string;
    options: MenuOption[];
    fallback_text?: string; // sent when no option matched
  };
};

export type CaptureNode = {
  id: string;
  type: "capture";
  data: {
    prompt: string;
    variable: string;
    validation?: "email" | "phone" | "number" | "none";
    error_text?: string; // sent on validation failure
  };
  next: string;
};

export type ConditionOperator = "eq" | "neq" | "contains" | "starts_with" | "gt" | "lt";

export type ConditionNode = {
  id: string;
  type: "condition";
  data: {
    variable: string;
    operator: ConditionOperator;
    value: string;
    true_next: string;
    false_next: string;
  };
};

export type EndNode = {
  id: string;
  type: "end";
};

export type FlowNode = MessageNode | MenuNode | CaptureNode | ConditionNode | EndNode;

// ── Flow JSON (stored in flow_versions.flow_json) ─────────────────────────

export type FlowJSON = {
  start_node: string;
  nodes: FlowNode[];
};

// ── Executor contract ──────────────────────────────────────────────────────

export type ExecuteInput = {
  tenant_id: string;
  contact_id: string;
  message_text: string;
  current_node: string | null; // null = new conversation, needs keyword lookup
  variables: Record<string, string>;
  recent_history?: Array<{ role: "user" | "assistant"; text: string }>;
};

export type ExecuteOutput =
  | {
      kind: "reply";
      reply_text?: string;
      reply_buttons?: MenuOption[];
      next_node: string | null;
      variables: Record<string, string>;
    }
  | { kind: "ai_fallback"; prompt_context: string } // no matching node — delegate to AI
  | { kind: "end"; variables: Record<string, string> };

// ── D1 row shapes ──────────────────────────────────────────────────────────

export type FlowRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type FlowVersionRow = {
  id: string;
  flow_id: string;
  version: number;
  flow_json: string;
  published: number;
  created_at: string;
};

// ── Worker bindings ────────────────────────────────────────────────────────

export type Env = {
  DB: D1Database;
  AI: Ai;
  ENVIRONMENT: string;
};
