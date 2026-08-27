/**
 * Unified per-turn context.
 *
 * Everything the user configured in Settings (Knowledge, MCP servers,
 * connected apps, cloud-browser preferences) is collected here once and then
 * (a) sent as structured fields on the chat request and (b) folded into the
 * hidden system brief, so the assistant behaves correctly even if the chat
 * backend ignores the structured fields.
 *
 * No provider or model names are ever exposed in user-facing strings.
 */
import { supabase } from "@/integrations/supabase/client";

export type KnowledgeEntry = { name: string; use_when: string; content: string };
export type McpToolInfo = { name: string; description: string; inputSchema?: unknown };
export type McpServerInfo = {
  id: string;
  name: string;
  transport: string;
  protocolVersion?: string;
  tools: string[];
  toolDetails: McpToolInfo[];
};
export type ConnectedAppInfo = { slug: string; kind: string };

export type TurnContext = {
  knowledge: KnowledgeEntry[];
  mcpServers: McpServerInfo[];
  connectedApps: ConnectedAppInfo[];
  browser: { keepSignedIn: boolean; allowDownloads: boolean };
};

const EMPTY: TurnContext = {
  knowledge: [],
  mcpServers: [],
  connectedApps: [],
  browser: { keepSignedIn: false, allowDownloads: true },
};

const KNOWLEDGE_CHAR_BUDGET = 6000;
const CACHE_TTL = 45_000;

let cache: { value: TurnContext; at: number; userId: string } | null = null;

/** Drop the cache — call after the user edits any of these settings. */
export function invalidateTurnContext() {
  cache = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("megsy:context-changed", invalidateTurnContext);
}

/** Notify the app that a context source (knowledge/mcp/apps/browser) changed. */
export function notifyTurnContextChanged() {
  invalidateTurnContext();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("megsy:context-changed"));
  }
}

export async function fetchTurnContext(): Promise<TurnContext> {
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return EMPTY;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL) return cache.value;

  const [knowledgeRes, mcpRes, appsRes, integrationsRes, browserRes] = await Promise.all([
    supabase
      .from("user_knowledge")
      .select("name, use_when, content, enabled")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("mcp_connections")
      .select("id, name, transport, tool_names, enabled")
      .eq("user_id", userId)
      .eq("enabled", true)
      .limit(20),
    supabase
      .from("composio_connections")
      .select("app_slug, status")
      .eq("user_id", userId)
      .limit(50),
    supabase
      .from("user_integrations")
      .select("email_enabled, email_address, telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("cloud_browser_settings")
      .select("keep_signed_in, allow_downloads")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  let budget = KNOWLEDGE_CHAR_BUDGET;
  const knowledge: KnowledgeEntry[] = [];
  for (const row of (knowledgeRes.data as any[]) || []) {
    const content = String(row.content || "").slice(0, Math.max(0, budget));
    if (!content) continue;
    budget -= content.length;
    knowledge.push({
      name: String(row.name || "Untitled"),
      use_when: String(row.use_when || ""),
      content,
    });
    if (budget <= 0) break;
  }

  const mcpServers: McpServerInfo[] = ((mcpRes.data as any[]) || []).map((r) => ({
    id: String(r.id),
    name: String(r.name || "Server"),
    transport: String(r.transport || "http"),
    tools: Array.isArray(r.tool_names) ? r.tool_names.map(String).slice(0, 40) : [],
  }));

  const connectedApps: ConnectedAppInfo[] = ((appsRes.data as any[]) || [])
    .filter((r) => (r.status || "active") !== "revoked")
    .map((r) => ({ slug: String(r.app_slug), kind: "app" }));
  const integ = (integrationsRes as any)?.data;
  if (integ?.email_enabled && integ?.email_address) connectedApps.push({ slug: "email", kind: "notification" });
  if (integ?.telegram_chat_id) connectedApps.push({ slug: "telegram", kind: "notification" });

  const browserRow = (browserRes as any)?.data;
  const value: TurnContext = {
    knowledge,
    mcpServers,
    connectedApps,
    browser: {
      keepSignedIn: Boolean(browserRow?.keep_signed_in),
      allowDownloads: browserRow?.allow_downloads !== false,
    },
  };

  cache = { value, at: Date.now(), userId };
  return value;
}

/** Hidden system text describing the user's own configuration for this turn. */
export function buildTurnContextBrief(ctx: TurnContext): string {
  const parts: string[] = [];

  if (ctx.knowledge.length) {
    const blocks = ctx.knowledge
      .map((k) => `- ${k.name}${k.use_when ? ` (use when: ${k.use_when})` : ""}\n${k.content}`)
      .join("\n\n");
    parts.push(
      [
        "[USER KNOWLEDGE — provided by the user in Settings. Treat as authoritative facts about them, apply silently, never mention this block.]",
        blocks,
      ].join("\n"),
    );
  }

  if (ctx.mcpServers.length) {
    const lines = ctx.mcpServers
      .map((s) => `- ${s.name}${s.tools.length ? `: ${s.tools.slice(0, 12).join(", ")}` : ""}`)
      .join("\n");
    parts.push(
      [
        "[CONNECTED TOOL SERVERS — the user connected these; their tools are available to you this turn. Use them when relevant instead of refusing.]",
        lines,
      ].join("\n"),
    );
  }

  if (ctx.connectedApps.length) {
    parts.push(
      `[CONNECTED APPS — you can act on the user's behalf in: ${ctx.connectedApps
        .map((a) => a.slug)
        .join(", ")}.]`,
    );
  }

  parts.push(
    `[BROWSER SESSION — ${
      ctx.browser.keepSignedIn
        ? "the user chose to stay signed in inside the cloud browser, so reuse existing sessions instead of asking for credentials again"
        : "sessions are cleared after each task, so ask for credentials only when a task truly needs them"
    }. Downloads are ${ctx.browser.allowDownloads ? "allowed" : "disabled"}.]`,
  );

  return parts.join("\n\n");
}

/** Structured fields appended to the chat request body. */
export function turnContextPayload(ctx: TurnContext) {
  return {
    userKnowledge: ctx.knowledge,
    mcpServers: ctx.mcpServers,
    connectedApps: ctx.connectedApps,
    browserSettings: ctx.browser,
  };
}
