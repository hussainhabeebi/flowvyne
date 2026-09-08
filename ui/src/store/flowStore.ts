import { create } from "zustand";
import { addEdge, applyNodeChanges, applyEdgeChanges } from "reactflow";
import type { Node, Edge, Connection, NodeChange, EdgeChange } from "reactflow";

export type FlowMeta = {
  id: string;
  name: string;
  description: string;
  is_active: number;
};

type FlowStore = {
  // Canvas state
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Flow metadata
  flowMeta: FlowMeta | null;
  isDirty: boolean;

  // Actions
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  addNode: (node: Node) => void;
  deleteNode: (id: string) => void;
  loadFlow: (meta: FlowMeta, nodes: Node[], edges: Edge[]) => void;
  markSaved: () => void;
};

export const useFlowStore = create<FlowStore>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  flowMeta: null,
  isDirty: false,

  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      isDirty: true,
    })),

  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      isDirty: true,
    })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, type: "smoothstep", animated: true }, s.edges),
      isDirty: true,
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodeData: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    })),

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node], isDirty: true })),

  deleteNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      isDirty: true,
    })),

  loadFlow: (meta, nodes, edges) =>
    set({ flowMeta: meta, nodes, edges, isDirty: false, selectedNodeId: null }),

  markSaved: () => set({ isDirty: false }),
}));
