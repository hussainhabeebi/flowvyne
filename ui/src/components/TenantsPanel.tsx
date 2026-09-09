import { useEffect, useState } from "react";
import { Users, Plus, Trash2, RefreshCw } from "lucide-react";

type Tenant = { tenant_id: string; enabled_at: string; note: string | null };

export function TenantsPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [newId, setNewId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/tenants");
    setTenants(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newId.trim()) return;
    setAdding(true);
    setError("");
    const r = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: newId.trim(), note: newNote.trim() || undefined }),
    });
    if (r.ok) {
      setNewId("");
      setNewNote("");
      await load();
    } else {
      const d = await r.json() as { error?: string };
      setError(d.error ?? "Failed to add client");
    }
    setAdding(false);
  };

  const handleRemove = async (tenantId: string) => {
    if (!confirm(`Disable Flowvyne for client "${tenantId}"?`)) return;
    await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <div className="flex items-center gap-2 mb-1">
        <Users size={20} className="text-brand-500" />
        <h2 className="text-lg font-semibold text-slate-800">Enrolled Clients</h2>
        <button onClick={load} className="ml-auto text-slate-400 hover:text-slate-600 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Only clients listed here will have Flowvyne's scripted flows activated.
        All others continue through Leadvyne's AI path as normal.
      </p>

      {/* Add form */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Enable a client</p>
        <div className="flex gap-2 mb-2">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Client ID (from Leadvyne)"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newId.trim()}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 px-3 py-2 rounded-lg transition-all"
          >
            <Plus size={14} />
            {adding ? "Adding…" : "Enable"}
          </button>
        </div>
        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Note (optional — e.g. client name)"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          No clients enrolled yet. Add one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {tenants.map((t) => (
            <li key={t.tenant_id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-medium text-slate-800 truncate">{t.tenant_id}</p>
                {t.note && <p className="text-xs text-slate-400 truncate">{t.note}</p>}
                <p className="text-xs text-slate-300">
                  Enabled {new Date(t.enabled_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRemove(t.tenant_id)}
                className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                title="Disable"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
