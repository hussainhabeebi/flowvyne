const urlTenant = new URLSearchParams(window.location.search).get("tenant");
if (urlTenant) localStorage.setItem("tenant_id", urlTenant);
const TENANT_ID = localStorage.getItem("tenant_id") ?? "dev-tenant";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": TENANT_ID,
      ...(options?.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error: string }).error ?? "Request failed");
  }
  return resp.json() as Promise<T>;
}

export type FlowListItem = {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  updated_at: string;
};

export type FlowDetail = FlowListItem & {
  current_version: {
    id: string;
    version: number;
    flow_json: { start_node: string; nodes: unknown[] };
  } | null;
  trigger_keywords: string[];
};

export type Template = {
  id: string;
  name: string;
  description: string;
  vertical: string;
  trigger_keywords: string[];
  flow_json: { start_node: string; nodes: unknown[] };
};

export const api = {
  flows: {
    list: () => apiFetch<FlowListItem[]>("/flows"),
    get: (id: string) => apiFetch<FlowDetail>(`/flows/${id}`),
    create: (body: {
      name: string;
      description?: string;
      flow_json: object;
      trigger_keywords: string[];
    }) => apiFetch<{ id: string; version_id: string }>("/flows", { method: "POST", body: JSON.stringify(body) }),
    publish: (id: string, body: { flow_json: object; trigger_keywords?: string[] }) =>
      apiFetch<{ version: number; version_id: string }>(`/flows/${id}/publish`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) => apiFetch<{ ok: true }>(`/flows/${id}`, { method: "DELETE" }),
  },
  templates: {
    list: () => apiFetch<Omit<Template, "flow_json">[]>("/templates"),
    get: (id: string) => apiFetch<Template>(`/templates/${id}`),
  },
};
