/** @doc The big API directory (thousands of services, live from APIs.guru).
 *
 *  The curated catalog stays first-class; this adds a searchable index of every
 *  public API that publishes an OpenAPI description. When the user opens one we
 *  fetch its description and turn its endpoints into usable tools, so any of
 *  them becomes a ready-made app as soon as the user pastes their key.
 */
import type { ApiApp, ApiAppParam, ApiAppTool } from "./types";

const LIST_URL = "https://api.apis.guru/v2/list.json";
const CACHE_KEY = "api-directory-v1";

export type DirectoryEntry = {
  id: string;
  name: string;
  description: string;
  logo: string;
  docsUrl: string;
  specUrl: string;
};

let memo: DirectoryEntry[] | null = null;

function clean(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").replace(/<[^>]+>/g, "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Load and cache the directory index. Never throws — returns [] on failure. */
export async function fetchDirectory(): Promise<DirectoryEntry[]> {
  if (memo) return memo;
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      memo = JSON.parse(cached) as DirectoryEntry[];
      return memo;
    }
  } catch {
    /* ignore cache problems */
  }
  try {
    const res = await fetch(LIST_URL);
    if (!res.ok) return [];
    const raw = (await res.json()) as Record<string, any>;
    const out: DirectoryEntry[] = [];
    for (const [key, api] of Object.entries(raw)) {
      const versions = api?.versions ?? {};
      const pref = api?.preferred ?? Object.keys(versions)[0];
      const v = versions[pref];
      const info = v?.info ?? {};
      if (!v?.swaggerUrl || !info?.title) continue;
      out.push({
        id: `dir:${key}`,
        name: clean(String(info.title), 48),
        description: clean(String(info.description ?? key)),
        logo: String(info["x-logo"]?.url ?? ""),
        docsUrl: String(
          info.contact?.url ?? v.externalDocs?.url ?? `https://apis.guru/#${encodeURIComponent(key)}`,
        ),
        specUrl: String(v.swaggerUrl),
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    memo = out;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(out));
    } catch {
      /* quota — memory cache is enough */
    }
    return out;
  } catch {
    return [];
  }
}

export function searchDirectory(entries: DirectoryEntry[], query: string, limit = 60) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: DirectoryEntry[] = [];
  const rest: DirectoryEntry[] = [];
  for (const e of entries) {
    const name = e.name.toLowerCase();
    if (name.startsWith(q)) starts.push(e);
    else if (name.includes(q) || e.description.toLowerCase().includes(q)) rest.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...rest].slice(0, limit);
}

type Auth = ApiApp["auth"];

function readAuth(spec: any): Auth | null {
  const schemes: Record<string, any> =
    spec?.components?.securitySchemes ?? spec?.securityDefinitions ?? {};
  for (const s of Object.values(schemes)) {
    const type = String(s?.type ?? "").toLowerCase();
    if (type === "apikey" && s?.name) {
      const where = String(s.in ?? "header").toLowerCase();
      if (where === "header") return { type: "header", name: String(s.name) };
      if (where === "query") return { type: "query", name: String(s.name) };
    }
    if (type === "http" && String(s?.scheme ?? "").toLowerCase() === "bearer") {
      return { type: "header", name: "Authorization", prefix: "Bearer " };
    }
  }
  return null;
}

function readBaseUrl(spec: any): string {
  const server = spec?.servers?.[0]?.url;
  if (typeof server === "string" && server.startsWith("http")) return server.replace(/\/$/, "");
  if (spec?.host) {
    const scheme = spec.schemes?.includes("https") ? "https" : (spec.schemes?.[0] ?? "https");
    return `${scheme}://${spec.host}${spec.basePath ?? ""}`.replace(/\/$/, "");
  }
  if (typeof server === "string") {
    const vars = spec?.servers?.[0]?.variables ?? {};
    let url = server;
    for (const [k, val] of Object.entries<any>(vars)) {
      url = url.replaceAll(`{${k}}`, String(val?.default ?? ""));
    }
    if (url.startsWith("http")) return url.replace(/\/$/, "");
  }
  return "";
}

function readTools(spec: any, max = 14): ApiAppTool[] {
  const tools: ApiAppTool[] = [];
  for (const [path, item] of Object.entries<any>(spec?.paths ?? {})) {
    for (const method of ["get", "post"] as const) {
      const op = item?.[method];
      if (!op) continue;
      const params: ApiAppParam[] = [];
      for (const p of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
        const where = String(p?.in ?? "").toLowerCase();
        if (!p?.name || (where !== "query" && where !== "path")) continue;
        params.push({
          name: String(p.name),
          in: where as "query" | "path",
          required: Boolean(p.required),
          description: clean(String(p.description ?? p.name), 70),
        });
      }
      const bodyProps =
        op.requestBody?.content?.["application/json"]?.schema?.properties ?? {};
      for (const [name, schema] of Object.entries<any>(bodyProps).slice(0, 8)) {
        params.push({
          name,
          in: "body",
          required: false,
          description: clean(String(schema?.description ?? name), 70),
        });
      }
      tools.push({
        name: clean(String(op.summary || op.operationId || `${method.toUpperCase()} ${path}`), 52),
        description: clean(String(op.description || op.summary || path), 80),
        method: method.toUpperCase() as "GET" | "POST",
        path,
        params: params.slice(0, 10),
      });
      if (tools.length >= max) return tools;
    }
  }
  return tools;
}

/** Turn a directory entry into a usable app by reading its OpenAPI description. */
export async function loadDirectoryApp(entry: DirectoryEntry): Promise<ApiApp> {
  const res = await fetch(entry.specUrl);
  if (!res.ok) throw new Error("Could not read this service description");
  const spec = await res.json();
  const baseUrl = readBaseUrl(spec);
  if (!baseUrl) throw new Error("This service does not publish a usable address");
  const tools = readTools(spec);
  if (!tools.length) throw new Error("This service exposes no callable endpoints");
  return {
    id: entry.id,
    name: entry.name,
    category: "data",
    description: entry.description,
    docsUrl: entry.docsUrl,
    keyUrl: entry.docsUrl,
    baseUrl,
    auth: readAuth(spec) ?? { type: "header", name: "Authorization", prefix: "Bearer " },
    logo: entry.logo,
    tools,
  };
}
