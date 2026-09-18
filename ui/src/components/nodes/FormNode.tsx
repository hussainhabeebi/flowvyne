import { Handle, Position } from "reactflow";
import { ClipboardList } from "lucide-react";

type Props = {
  data: {
    title?: string;
    fields?: Array<{ label: string; required?: boolean }>;
    sheet_sync?: { enabled?: boolean };
  };
  selected: boolean;
};

export function FormNode({ data, selected }: Props) {
  const fields = data.fields ?? [];
  return (
    <div className={`w-64 rounded-xl bg-white border-2 shadow-sm overflow-hidden ${selected ? "border-cyan-500" : "border-cyan-200"}`}>
      <div className="flex items-center gap-2 bg-cyan-500 text-white px-3 py-2">
        <ClipboardList size={15} />
        <span className="text-xs font-semibold">FORM</span>
        {data.sheet_sync?.enabled && <span className="ml-auto text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Sheets</span>}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-slate-800 truncate">{data.title || "Untitled form"}</p>
        <p className="mt-1 text-xs text-slate-500">{fields.length} field{fields.length === 1 ? "" : "s"}</p>
        {fields.slice(0, 3).map((field, index) => (
          <p key={index} className="text-[11px] text-slate-400 truncate mt-1">
            {field.required !== false ? "•" : "○"} {field.label || "Unnamed field"}
          </p>
        ))}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-cyan-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500" />
    </div>
  );
}
