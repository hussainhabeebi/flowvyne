import { useState, useEffect } from "react";
import { Plus, ChevronRight, Layers, Trash2 } from "lucide-react";
import { api, type FlowListItem, type Template } from "../hooks/useApi";
import { canvasToFlowJson } from "../utils/serialize";

type Props = { onOpen: (id: string) => void };

export function FlowList({ onOpen }: Props) {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [templates, setTemplates] = useState<Omit<Template, "flow_json">[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [f, t] = await Promise.all([api.flows.list(), api.templates.list()]);
      setFlows(f);
      setTemplates(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createBlank = async () => {
    setCreating(true);
    try {
      const { id } = await api.flows.create({
        name: "Untitled Flow",
        flow_json: canvasToFlowJson([], []),
        trigger_keywords: [],
      });
      onOpen(id);
    } finally {
      setCreating(false);
    }
  };

  const createFromTemplate = async (tplId: string, _tplName: string) => {
    setCreating(true);
    try {
      const tpl = await api.templates.get(tplId);
      const { id } = await api.flows.create({
        name: tpl.name,
        description: tpl.description,
        flow_json: tpl.flow_json,
        trigger_keywords: tpl.trigger_keywords,
      });
      onOpen(id);
    } finally {
      setCreating(false);
    }
  };

  const deleteFlow = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this flow?")) return;
    await api.flows.delete(id);
    setFlows((f) => f.filter((x) => x.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Flowvyne</h1>
            <p className="text-sm text-slate-500 mt-1">Conversational flow builder for Leadvyne</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTemplates((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 rounded-xl"
            >
              <Layers size={15} /> Templates
            </button>
            <button
              onClick={createBlank}
              disabled={creating}
              className="flex items-center gap-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-60 px-4 py-2 rounded-xl"
            >
              <Plus size={15} /> New Flow
            </button>
          </div>
        </div>

        {/* Templates panel */}
        {showTemplates && (
          <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Start from a template</h2>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => createFromTemplate(t.id, t.name)}
                  disabled={creating}
                  className="text-left border border-slate-200 rounded-xl p-3 hover:border-brand-500 hover:shadow-sm transition-all"
                >
                  <p className="font-medium text-sm text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                  <span className="mt-2 inline-block text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                    {t.vertical}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Flow list */}
        {loading ? (
          <p className="text-slate-400 text-sm text-center py-16">Loading flows…</p>
        ) : flows.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-lg font-medium mb-1">No flows yet</p>
            <p className="text-sm">Create a blank flow or start from a template.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {flows.map((f) => (
              <button
                key={f.id}
                onClick={() => onOpen(f.id)}
                className="w-full flex items-center text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-brand-500 hover:shadow-sm transition-all group"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-800 group-hover:text-brand-600">{f.name}</p>
                  {f.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{f.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    Updated {new Date(f.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => deleteFlow(e, f.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-brand-500" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
