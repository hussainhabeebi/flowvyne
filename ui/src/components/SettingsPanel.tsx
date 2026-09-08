import { useEffect, useState } from "react";
import { Save, Brain } from "lucide-react";

const TENANT_ID = localStorage.getItem("tenant_id") ?? "dev-tenant";

export function SettingsPanel() {
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { headers: { "X-Tenant-Id": TENANT_ID } })
      .then((r) => r.json())
      .then((d: { system_context: string }) => setContext(d.system_context ?? ""));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Tenant-Id": TENANT_ID },
      body: JSON.stringify({ system_context: context }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <div className="flex items-center gap-2 mb-1">
        <Brain size={20} className="text-brand-500" />
        <h2 className="text-lg font-semibold text-slate-800">AI Business Context</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Describe your business — products, services, pricing, hours, location. Flowvyne's AI
        uses this to answer customer questions that aren't covered by a flow.
      </p>

      <textarea
        value={context}
        onChange={(e) => { setContext(e.target.value); setSaved(false); }}
        rows={12}
        placeholder={`Example:\nAcme Dental Clinic — Dubai Marina, open Sat–Thu 9am–6pm.\nServices: Implants AED 3,500 · Cleaning AED 200 · Whitening AED 500.\nEmergency line: +971 4 123 4567.\nAll treatments include a free follow-up within 7 days.`}
        className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none font-mono text-slate-700 bg-slate-50"
      />

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 px-4 py-2 rounded-lg transition-all"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        This context is stored in Flowvyne and never sent to Leadvyne — no code changes needed there.
      </p>
    </div>
  );
}
