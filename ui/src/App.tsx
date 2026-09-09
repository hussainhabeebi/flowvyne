import { useState } from "react";
import { FlowList } from "./components/FlowList";
import { FlowBuilder } from "./components/FlowBuilder";
import { SettingsPanel } from "./components/SettingsPanel";
import { TenantsPanel } from "./components/TenantsPanel";
import { GitBranch, Settings, Users } from "lucide-react";

type View = { page: "list" } | { page: "builder"; flowId: string } | { page: "settings" } | { page: "tenants" };

export default function App() {
  const [view, setView] = useState<View>({ page: "list" });

  if (view.page === "builder") {
    return (
      <FlowBuilder
        flowId={view.flowId}
        onBack={() => setView({ page: "list" })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6 shrink-0">
        <div className="flex items-center gap-2 font-bold text-brand-500 text-base select-none">
          <GitBranch size={18} />
          Flowvyne
        </div>
        <nav className="flex gap-1">
          <button
            onClick={() => setView({ page: "list" })}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all ${
              view.page === "list"
                ? "bg-brand-50 text-brand-600"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            Flows
          </button>
          <button
            onClick={() => setView({ page: "tenants" })}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-all ${
              view.page === "tenants"
                ? "bg-brand-50 text-brand-600"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Users size={13} />
            Clients
          </button>
          <button
            onClick={() => setView({ page: "settings" })}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-all ${
              view.page === "settings"
                ? "bg-brand-50 text-brand-600"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Settings size={13} />
            AI Settings
          </button>
        </nav>
      </header>

      <main className="flex-1">
        {view.page === "list" && (
          <FlowList onOpen={(id) => setView({ page: "builder", flowId: id })} />
        )}
        {view.page === "tenants" && <TenantsPanel />}
        {view.page === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
