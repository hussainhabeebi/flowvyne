import { MessageSquare, List, TextCursorInput, GitBranch, CircleStop, Save, Play } from "lucide-react";
import { useFlowStore } from "../store/flowStore";

type NodeType = "message" | "menu" | "capture" | "condition" | "end";

const NODE_DEFS: { type: NodeType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: "message", label: "Message", icon: <MessageSquare size={15} />, color: "bg-brand-500" },
  { type: "menu", label: "Menu", icon: <List size={15} />, color: "bg-purple-500" },
  { type: "capture", label: "Capture", icon: <TextCursorInput size={15} />, color: "bg-emerald-500" },
  { type: "condition", label: "Condition", icon: <GitBranch size={15} />, color: "bg-amber-500" },
  { type: "end", label: "End", icon: <CircleStop size={15} />, color: "bg-rose-500" },
];

const DEFAULT_DATA: Record<NodeType, object> = {
  message: { text: "" },
  menu: { text: "", options: [] },
  capture: { prompt: "", variable: "value", validation: "none" },
  condition: { variable: "", operator: "eq", value: "" },
  end: {},
};

type Props = {
  onSave: () => void;
  onSimulate: () => void;
  isSaving: boolean;
  isDirty: boolean;
};

export function Toolbar({ onSave, onSimulate, isSaving, isDirty }: Props) {
  const { addNode, nodes } = useFlowStore();

  const handleAdd = (type: NodeType) => {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    addNode({
      id,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { ...DEFAULT_DATA[type] },
    });
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white rounded-2xl shadow-lg border border-slate-200 px-4 py-2">
      {/* Node palette */}
      {NODE_DEFS.map((def) => (
        <button
          key={def.type}
          onClick={() => handleAdd(def.type)}
          title={`Add ${def.label} node`}
          className={`flex items-center gap-1.5 text-xs font-medium text-white ${def.color} hover:opacity-90 px-3 py-1.5 rounded-lg transition-all`}
        >
          {def.icon}
          {def.label}
        </button>
      ))}

      <div className="w-px h-6 bg-slate-200 mx-1" />

      {/* Actions */}
      <button
        onClick={onSimulate}
        title="Test-run this flow"
        className="flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-all"
      >
        <Play size={14} className="text-emerald-500" />
        Simulate
      </button>

      <button
        onClick={onSave}
        disabled={isSaving || (!isDirty && nodes.length > 0)}
        title="Publish a new version"
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all"
      >
        <Save size={14} />
        {isSaving ? "Saving…" : isDirty ? "Publish" : "Saved"}
      </button>
    </div>
  );
}
