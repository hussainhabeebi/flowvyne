import { Handle, Position } from "reactflow";
import { CircleStop } from "lucide-react";

type Props = { selected: boolean };

export function EndNode({ selected }: Props) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border-2 p-4 w-40 flex flex-col items-center transition-all ${
        selected ? "border-rose-500 shadow-rose-500/20 shadow-lg" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-rose-500" />
      <CircleStop size={20} className="text-rose-500 mb-1" />
      <span className="text-xs font-semibold text-rose-500 uppercase tracking-wide">End</span>
    </div>
  );
}
