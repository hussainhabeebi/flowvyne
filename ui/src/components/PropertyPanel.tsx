import { useFlowStore } from "../store/flowStore";
import { Trash2, X } from "lucide-react";

export function PropertyPanel() {
  const { nodes, selectedNodeId, selectNode, updateNodeData, deleteNode } = useFlowStore();

  if (!selectedNodeId) return null;

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const update = (patch: Record<string, unknown>) => updateNodeData(node.id, patch);

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="font-semibold text-slate-800 capitalize">{node.type} Node</span>
        <button onClick={() => selectNode(null)} className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.type === "message" && <MessageFields data={node.data} update={update} />}
        {node.type === "menu" && <MenuFields data={node.data} update={update} />}
        {node.type === "capture" && <CaptureFields data={node.data} update={update} />}
        {node.type === "condition" && <ConditionFields data={node.data} update={update} />}
        {node.type === "end" && <p className="text-sm text-slate-500">End node has no settings.</p>}
      </div>

      {/* Delete */}
      {node.type !== "end" && (
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => deleteNode(node.id)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700"
          >
            <Trash2 size={15} /> Delete node
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-forms ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600 mb-1">{children}</label>;
}

function Textarea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
    />
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
    />
  );
}

// Converts any Google Drive share/view URL into a direct-image URL.
// Other URLs are returned unchanged.
function toDirectImageUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.hostname !== "drive.google.com") return raw.trim();

    // https://drive.google.com/file/d/<ID>/view?...
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
    }

    // https://drive.google.com/open?id=<ID>
    const idParam = url.searchParams.get("id");
    if (idParam) {
      return `https://drive.google.com/uc?export=view&id=${idParam}`;
    }
  } catch {
    // not a valid URL — leave as-is
  }
  return raw.trim();
}

function MessageFields({
  data,
  update,
}: {
  data: { text: string; image_url?: string };
  update: (p: Record<string, unknown>) => void;
}) {
  const rawImageUrl = data.image_url ?? "";
  const directUrl = rawImageUrl ? toDirectImageUrl(rawImageUrl) : "";
  const isConverted = directUrl && directUrl !== rawImageUrl;

  return (
    <div className="space-y-4">
      <div>
        <Label>Message text (use {"{{variable}}"} for variables)</Label>
        <Textarea value={data.text ?? ""} onChange={(v) => update({ text: v })} rows={5} />
      </div>

      <div>
        <Label>Image URL (optional — Google Drive or direct link)</Label>
        <Input
          value={rawImageUrl}
          onChange={(v) => update({ image_url: v || undefined })}
          placeholder="https://drive.google.com/file/d/…/view"
        />
        {isConverted && (
          <p className="mt-1 text-xs text-slate-400 break-all">
            Will send as: <span className="text-emerald-600">{directUrl}</span>
          </p>
        )}
        {directUrl && (
          <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <img
              src={directUrl}
              alt="preview"
              className="w-full max-h-36 object-contain"
              onError={(e) => (e.currentTarget.style.display = "none")}
              onLoad={(e) => (e.currentTarget.style.display = "")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type MenuOption = { label: string; value: string; next: string };

function MenuFields({
  data,
  update,
}: {
  data: { text: string; options: MenuOption[]; fallback_text?: string };
  update: (p: Record<string, unknown>) => void;
}) {
  const options: MenuOption[] = data.options ?? [];

  const updateOption = (i: number, patch: Partial<MenuOption>) => {
    const next = options.map((o, idx) => (idx === i ? { ...o, ...patch } : o));
    update({ options: next });
  };

  const addOption = () =>
    update({ options: [...options, { label: "", value: "", next: "" }] });

  const removeOption = (i: number) =>
    update({ options: options.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div>
        <Label>Menu prompt</Label>
        <Textarea value={data.text ?? ""} onChange={(v) => update({ text: v })} />
      </div>
      <div>
        <Label>Options</Label>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-500">Option {i + 1}</span>
                <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
              <Input
                value={opt.label}
                onChange={(v) => updateOption(i, { label: v })}
                placeholder="Button label"
              />
              <Input
                value={opt.value}
                onChange={(v) => updateOption(i, { value: v })}
                placeholder="Match value (e.g. yes)"
              />
            </div>
          ))}
        </div>
        <button
          onClick={addOption}
          className="mt-2 text-xs text-brand-500 hover:text-brand-700 font-medium"
        >
          + Add option
        </button>
      </div>
      <div>
        <Label>Fallback text (if no option matched)</Label>
        <Input
          value={data.fallback_text ?? ""}
          onChange={(v) => update({ fallback_text: v })}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

function CaptureFields({
  data,
  update,
}: {
  data: {
    prompt: string;
    mode?: "single" | "structured";
    variable?: string;
    validation?: string;
    error_text?: string;
    fields?: StructuredField[];
  };
  update: (p: Record<string, unknown>) => void;
}) {
  const isStructured = data.mode === "structured";
  const fields = data.fields ?? [];

  const updateField = (index: number, patch: Partial<StructuredField>) =>
    update({ fields: fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) });

  const addField = () =>
    update({
      fields: [
        ...fields,
        { label: "", variable: "", required: true, validation: "none", aliases: [] },
      ],
    });

  return (
    <div className="space-y-4">
      <div>
        <Label>Capture mode</Label>
        <select
          value={isStructured ? "structured" : "single"}
          onChange={(e) => {
            if (e.target.value === "structured") {
              update({ mode: "structured", fields: fields.length ? fields : [], variable: undefined, validation: undefined, error_text: undefined });
            } else {
              update({ mode: "single", variable: data.variable ?? "value", validation: "none", fields: undefined });
            }
          }}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          <option value="single">Single value</option>
          <option value="structured">Structured form</option>
        </select>
      </div>
      <div>
        <Label>Prompt (optional — shown before waiting for input)</Label>
        <Textarea value={data.prompt ?? ""} onChange={(v) => update({ prompt: v })} rows={isStructured ? 8 : 3} />
      </div>
      {!isStructured ? (
        <>
          <div>
            <Label>Variable name (no braces)</Label>
            <Input
              value={data.variable ?? ""}
              onChange={(v) => update({ variable: cleanVariable(v) })}
              placeholder="e.g. email"
            />
          </div>
          <div>
            <Label>Validation</Label>
            <ValidationSelect value={data.validation} onChange={(validation) => update({ validation })} />
          </div>
          <div>
            <Label>Validation error text</Label>
            <Input value={data.error_text ?? ""} onChange={(v) => update({ error_text: v })} placeholder="Optional custom error message" />
          </div>
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Structured fields</Label>
            <button onClick={addField} className="text-xs text-brand-500 hover:text-brand-700">+ Add field</button>
          </div>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={index} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Field {index + 1}</span>
                  <button onClick={() => update({ fields: fields.filter((_, i) => i !== index) })} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </div>
                <Input value={field.label} onChange={(label) => updateField(index, { label })} placeholder="Label shown to customer" />
                <Input value={field.variable} onChange={(variable) => updateField(index, { variable: cleanVariable(variable) })} placeholder="Variable name" />
                <Input value={(field.aliases ?? []).join(", ")} onChange={(value) => updateField(index, { aliases: value.split(",").map((alias) => alias.trim()).filter(Boolean) })} placeholder="Aliases, comma separated" />
                <div className="grid grid-cols-2 gap-2 items-center">
                  <ValidationSelect value={field.validation} onChange={(validation) => updateField(index, { validation })} />
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={field.required !== false} onChange={(e) => updateField(index, { required: e.target.checked })} />
                    Required
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type StructuredField = {
  label: string;
  variable: string;
  required?: boolean;
  validation?: string;
  aliases?: string[];
};

function cleanVariable(value: string): string {
  return value.replace(/[^a-z0-9_]/gi, "_");
}

function ValidationSelect({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return (
    <select value={value ?? "none"} onChange={(e) => onChange(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40">
      <option value="none">None</option>
      <option value="email">Email</option>
      <option value="phone">Phone</option>
      <option value="number">Number</option>
    </select>
  );
}

function ConditionFields({
  data,
  update,
}: {
  data: { variable: string; operator: string; value: string };
  update: (p: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Variable name (no braces)</Label>
        <Input
          value={data.variable ?? ""}
          onChange={(v) => update({ variable: v })}
          placeholder="e.g. team_size"
        />
      </div>
      <div>
        <Label>Operator</Label>
        <select
          value={data.operator ?? "eq"}
          onChange={(e) => update({ operator: e.target.value })}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          <option value="eq">equals</option>
          <option value="neq">not equals</option>
          <option value="contains">contains</option>
          <option value="starts_with">starts with</option>
          <option value="gt">greater than</option>
          <option value="lt">less than</option>
        </select>
      </div>
      <div>
        <Label>Value</Label>
        <Input
          value={data.value ?? ""}
          onChange={(v) => update({ value: v })}
          placeholder="e.g. large"
        />
      </div>
      <p className="text-xs text-slate-400">
        Connect the <span className="text-emerald-600 font-medium">true</span> handle (left) and{" "}
        <span className="text-red-500 font-medium">false</span> handle (right) to the next nodes.
      </p>
    </div>
  );
}
