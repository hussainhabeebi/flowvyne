import { Handle, Position } from "reactflow";
import { TextCursorInput } from "lucide-react";

type Props = {
  data: { prompt: string; variable: string; validation?: string };
  selected: boolean;
};

export function CaptureNode({ data, selected }: Props) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border-2 p-4 w-64 transition-all ${
        selected ? "border-emerald-500 shadow-emerald-500/20 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-500" />
      <div className="flex items-center gap-2 mb-2">
        <TextCursorInput size={16} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wide">Capture</span>
      </div>
      <p className="text-sm text-slate-700 mb-2 line-clamp-2">
        {data.prompt || <span className="italic text-slate-400">No prompt set</span>}
      </p>
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-mono">
          {`{{${data.variable || "var"}}}`}
        </span>
        {data.validation && data.validation !== "none" && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {data.validation}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500" />
    </div>
  );
}
