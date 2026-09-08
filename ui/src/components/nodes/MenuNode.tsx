import { Handle, Position } from "reactflow";
import { List } from "lucide-react";

type Option = { label: string; value: string; next: string };
type Props = { data: { text: string; options: Option[] }; selected: boolean };

export function MenuNode({ data, selected }: Props) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border-2 p-4 w-72 transition-all ${
        selected ? "border-purple-500 shadow-purple-500/20 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      <div className="flex items-center gap-2 mb-2">
        <List size={16} className="text-purple-500 shrink-0" />
        <span className="text-xs font-semibold text-purple-500 uppercase tracking-wide">Menu</span>
      </div>
      <p className="text-sm text-slate-700 mb-3 line-clamp-2">
        {data.text || <span className="italic text-slate-400">No prompt set</span>}
      </p>
      <div className="space-y-1">
        {(data.options ?? []).map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {i + 1}
            </span>
            <span className="text-xs text-slate-600 truncate">{opt.label}</span>
            {/* Each option gets its own source handle */}
            <Handle
              type="source"
              position={Position.Right}
              id={`opt-${i}`}
              style={{ top: "auto", bottom: "auto" }}
              className="!bg-purple-500"
            />
          </div>
        ))}
        {(!data.options || data.options.length === 0) && (
          <p className="text-xs italic text-slate-400">No options yet</p>
        )}
      </div>
    </div>
  );
}
