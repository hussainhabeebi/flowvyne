import type { Node, Edge } from "reactflow";

type FlowJSON = { start_node: string; nodes: Record<string, unknown>[] };

// Converts Google Drive share/view links to direct-image URLs before persisting.
function toDirectImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.hostname !== "drive.google.com") return raw.trim();
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
    const idParam = url.searchParams.get("id");
    if (idParam) return `https://drive.google.com/uc?export=view&id=${idParam}`;
  } catch { /* not a valid URL */ }
  return raw.trim();
}

// Convert React Flow canvas state → Flowvyne flow_json (stored in D1)
export function canvasToFlowJson(nodes: Node[], edges: Edge[]): FlowJSON {
  const startNode = nodes.find((n) => !edges.some((e) => e.target === n.id));

  const serialized = nodes.map((n) => {
    const base = { id: n.id, type: n.type, data: n.data };

    if (n.type === "message") {
      const next = edges.find((e) => e.source === n.id)?.target ?? null;
      const image_url = toDirectImageUrl(n.data.image_url as string | undefined);
      return { ...base, data: { ...n.data, image_url }, next };
    }

    if (n.type === "menu") {
      const options = (n.data.options ?? []).map(
        (opt: { label: string; value: string; store_as?: string }, i: number) => ({
          label: opt.label,
          value: opt.value,
          ...(opt.store_as ? { store_as: opt.store_as } : {}),
          next: edges.find((e) => e.source === n.id && e.sourceHandle === `opt-${i}`)?.target ?? "",
        })
      );
      return { ...base, data: { ...n.data, options } };
    }

    if (n.type === "capture") {
      const next = edges.find((e) => e.source === n.id)?.target ?? "";
      return { ...base, next };
    }

    if (n.type === "condition") {
      const trueNext = edges.find((e) => e.source === n.id && e.sourceHandle === "true")?.target ?? "";
      const falseNext = edges.find((e) => e.source === n.id && e.sourceHandle === "false")?.target ?? "";
      return { ...base, data: { ...n.data, true_next: trueNext, false_next: falseNext } };
    }

    return base; // end node
  });

  return {
    start_node: startNode?.id ?? (nodes[0]?.id ?? ""),
    nodes: serialized,
  };
}

// Convert stored flow_json back to React Flow nodes + edges
export function flowJsonToCanvas(flowJson: FlowJSON): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let x = 100;

  for (const n of flowJson.nodes) {
    const type = n.type as string;
    const id = n.id as string;
    nodes.push({
      id,
      type,
      position: { x: x % 800, y: Math.floor(x / 800) * 200 + 100 },
      data: (n.data as object) ?? {},
    });
    x += 300;

    if (type === "message" && n.next) {
      edges.push({ id: `e-${id}`, source: id, target: n.next as string, type: "smoothstep", animated: true });
    }

    if (type === "menu") {
      const opts = (n.data as { options: { next: string }[] }).options ?? [];
      opts.forEach((opt, i) => {
        if (opt.next) {
          edges.push({ id: `e-${id}-${i}`, source: id, sourceHandle: `opt-${i}`, target: opt.next, type: "smoothstep", animated: true });
        }
      });
    }

    if (type === "capture" && n.next) {
      edges.push({ id: `e-${id}`, source: id, target: n.next as string, type: "smoothstep", animated: true });
    }

    if (type === "condition") {
      const d = n.data as { true_next: string; false_next: string };
      if (d.true_next) edges.push({ id: `e-${id}-t`, source: id, sourceHandle: "true", target: d.true_next, type: "smoothstep", animated: true, style: { stroke: "#10b981" } });
      if (d.false_next) edges.push({ id: `e-${id}-f`, source: id, sourceHandle: "false", target: d.false_next, type: "smoothstep", animated: true, style: { stroke: "#ef4444" } });
    }
  }

  return { nodes, edges };
}
