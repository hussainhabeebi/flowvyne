import { Handle, Position } from "reactflow";
import { MessageSquare } from "lucide-react";

type Props = { data: { text: string }; selected: boolean };

export function MessageNode({ data, selected }: Props) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border-2 p-4 w-64 transition-all ${
        selected ? "border-brand-500 shadow-brand-500/20 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-brand-500" />
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={16} className="text-brand-500 shrink-0" />
        <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Message</span>
      </div>
      <p className="text-sm text-slate-700 leading-snug line-clamp-3">
        {data.text || <span className="italic text-slate-400">No text set</span>}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-brand-500" />
    </div>
  );
}
