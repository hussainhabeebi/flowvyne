import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

import { useFlowStore } from "../store/flowStore";
import { MessageNode } from "./nodes/MessageNode";
import { MenuNode } from "./nodes/MenuNode";
import { CaptureNode } from "./nodes/CaptureNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { EndNode } from "./nodes/EndNode";
import { PropertyPanel } from "./PropertyPanel";
import { Toolbar } from "./Toolbar";
import { Simulator } from "./Simulator";
import { api } from "../hooks/useApi";
import { canvasToFlowJson, flowJsonToCanvas } from "../utils/serialize";
import { ArrowLeft } from "lucide-react";

const NODE_TYPES = {
  message: MessageNode,
  menu: MenuNode,
  capture: CaptureNode,
  condition: ConditionNode,
  end: EndNode,
};

type Props = {
  flowId: string;
  onBack: () => void;
};

export function FlowBuilder({ flowId, onBack }: Props) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    loadFlow,
    markSaved,
    isDirty,
    flowMeta,
  } = useFlowStore();

  const [isSaving, setIsSaving] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load flow on mount
  useEffect(() => {
    api.flows.get(flowId).then((flow) => {
      const { nodes: n, edges: e } = flow.current_version
        ? flowJsonToCanvas(flow.current_version.flow_json as { start_node: string; nodes: object[] })
        : { nodes: [], edges: [] };

      loadFlow(
        {
          id: flow.id,
          name: flow.name,
          description: flow.description ?? "",
          is_active: flow.is_active,
        },
        n,
        e
      );
      setKeywords(flow.trigger_keywords);
    });
  }, [flowId, loadFlow]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const flowJson = canvasToFlowJson(nodes, edges);
      await api.flows.publish(flowId, { flow_json: flowJson, trigger_keywords: keywords });
      markSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [flowId, nodes, edges, keywords, markSaved]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white z-10 shrink-0">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-slate-800 text-sm">{flowMeta?.name ?? "Flow"}</h1>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-400">Triggers:</span>
            {keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
            <button
              onClick={() => {
                const kw = prompt("Add trigger keyword:");
                if (kw) setKeywords((k) => [...new Set([...k, kw.toLowerCase()])]);
              }}
              className="text-xs text-brand-500 hover:text-brand-700 ml-1"
            >
              +
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {isDirty && <span className="text-xs text-amber-500 font-medium">Unsaved changes</span>}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => selectNode(node.id)}
          onPaneClick={() => selectNode(null)}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const colors: Record<string, string> = {
                message: "#4f6ef7",
                menu: "#a855f7",
                capture: "#10b981",
                condition: "#f59e0b",
                end: "#f43f5e",
              };
              return colors[n.type ?? ""] ?? "#94a3b8";
            }}
          />
        </ReactFlow>

        {/* Floating toolbar */}
        <Toolbar
          onSave={handleSave}
          onSimulate={() => setShowSimulator((v) => !v)}
          isSaving={isSaving}
          isDirty={isDirty}
        />

        {/* Property panel */}
        <PropertyPanel />

        {/* Simulator */}
        {showSimulator && <Simulator onClose={() => setShowSimulator(false)} />}
      </div>
    </div>
  );
}
