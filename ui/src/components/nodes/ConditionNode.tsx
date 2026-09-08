import { Handle, Position } from "reactflow";
import { GitBranch } from "lucide-react";

type Props = {
  data: { variable: string; operator: string; value: string };
  selected: boolean;
};

export function ConditionNode({ data, selected }: Props) {
  const expr = data.variable
    ? `{{${data.variable}}} ${data.operator ?? "eq"} "${data.value ?? ""}"`
    : "No condition set";

  return (
    <div
      className={`bg-white rounded-xl shadow-md border-2 p-4 w-64 transition-all ${
        selected ? "border-amber-500 shadow-amber-500/20 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500" />
      <div className="flex items-center gap-2 mb-2">
        <GitBranch size={16} className="text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">Condition</span>
      </div>
      <p className="text-xs font-mono text-slate-700 bg-slate-50 rounded p-2 break-all">{expr}</p>
      <div className="flex justify-between mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          True →
        </span>
        <span className="flex items-center gap-1">
          False →
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        </span>
      </div>
      {/* true branch */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: "30%" }}
        className="!bg-emerald-500"
      />
      {/* false branch */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: "70%" }}
        className="!bg-red-500"
      />
    </div>
  );
}
