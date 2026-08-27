/** @doc Server-side app-tools gateway (used by /api/pipedream and its dev twin).
 *
 *  This is the only place that talks to the connected-apps provider. The
 *  browser never sees provider credentials — it only sends its own Supabase
 *  access token, and every action is scoped to the caller's own rows.
 *
 *  Capabilities exposed to the agent:
 *    - which apps the signed-in user connected
 *    - the real action catalogue of each connected app (tool schemas)
 *    - configuring an action's inputs
 *    - running an action on behalf of that user
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ToolsAction =
  | "list"
  | "actions"
  | "props"
  | "run"
  | "set_enabled";

export interface ToolsPayload {
  action: ToolsAction;
  token?: string;
  app?: string;
  /** Provider action key, e.g. `slack-send-message`. */
  tool?: string;
  configured_props?: Record<string, unknown>;
  prop_name?: string;
  query?: string;
  enabled?: boolean;
}

type Result = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });

const API = "https://api.pipedream.com/v1";

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server misconfigured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function providerConfig() {
  const clientId = process.env.PIPEDREAM_CLIENT_ID;
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
  const projectId = process.env.PIPEDREAM_PROJECT_ID;
  if (!clientId || !clientSecret || !projectId) return null;
  return {
    clientId,
    clientSecret,
    projectId,
    environment: process.env.PIPEDREAM_ENVIRONMENT || "production",
  };
}

let tokenCache: { value: string; expiresAt: number } | null = null;

async function providerToken(cfg: NonNullable<ReturnType<typeof providerConfig>>): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok || !body?.access_token) {
    throw new Error(`App tools auth failed [${res.status}]: ${JSON.stringify(body ?? {}).slice(0, 300)}`);
  }
  tokenCache = {
    value: String(body.access_token),
    expiresAt: Date.now() + Math.max(60_000, Number(body.expires_in ?? 3600) * 1000),
  };
  return tokenCache.value;
}

async function providerFetch(
  cfg: NonNullable<ReturnType<typeof providerConfig>>,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<any> {
  const token = await providerToken(cfg);
  const url = new URL(`${API}/connect/${cfg.projectId}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-PD-Environment": cfg.environment,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const detail = typeof body?.error === "string" ? body.error : text.slice(0, 400);
    throw new Error(`App request failed [${res.status}]: ${detail}`);
  }
  return body;
}

async function requireUser(supabase: SupabaseClient, token?: string) {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

const appSlugOf = (account: any) =>
  account?.app?.name_slug ?? account?.app?.slug ?? account?.app_slug ?? account?.appSlug ?? null;

/** Connected accounts for one user, synced into `pipedream_accounts`. */
async function syncAccounts(
  supabase: SupabaseClient,
  cfg: NonNullable<ReturnType<typeof providerConfig>>,
  userId: string,
) {
  const body = await providerFetch(cfg, "/accounts", {
    query: { external_user_id: userId, limit: "100" },
  });
  const accounts: any[] = Array.isArray(body?.data) ? body.data : Array.isArray(body?.accounts) ? body.accounts : [];
  const rows = accounts
    .map((a) => {
      const slug = appSlugOf(a);
      if (!slug || !a?.id) return null;
      return {
        user_id: userId,
        app_slug: String(slug),
        account_id: String(a.id),
        external_user_id: userId,
        account_name: String(a.name ?? a.external_id ?? slug),
        healthy: a.healthy !== false,
        metadata: { app_name: a?.app?.name ?? null },
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as any[];

  if (rows.length) {
    await supabase.from("pipedream_accounts").upsert(rows, { onConflict: "user_id,app_slug" });
  }
  return rows;
}

/** Normalises a provider action into a tool descriptor the agent can read. */
function toTool(action: any, appSlug: string) {
  return {
    key: String(action?.key ?? action?.id ?? ""),
    app: appSlug,
    name: String(action?.name ?? action?.key ?? "Action"),
    description: String(action?.description ?? "").slice(0, 400),
    version: action?.version ? String(action.version) : undefined,
  };
}

export async function handleToolsGateway(payload: ToolsPayload | null): Promise<Result> {
  if (!payload?.action) return fail(400, "Missing action");
  const cfg = providerConfig();
  const supabase = db();
  const user = await requireUser(supabase, payload.token);
  if (!user) return fail(401, "Sign in first");
  const userId = user.id;

  if (!cfg) {
    if (payload.action === "list") return ok({ configured: false, apps: [] });
    return fail(400, "App tools are not configured on the server yet");
  }

  switch (payload.action) {
    case "list": {
      const [accounts, settings] = await Promise.all([
        syncAccounts(supabase, cfg, userId).catch(async () => {
          const { data } = await supabase
            .from("pipedream_accounts")
            .select("app_slug, account_id, account_name, healthy")
            .eq("user_id", userId);
          return (data as any[]) ?? [];
        }),
        supabase.from("pipedream_tool_settings").select("app_slug, enabled").eq("user_id", userId),
      ]);
      const disabled = new Set(
        ((settings.data as any[]) ?? []).filter((r) => r.enabled === false).map((r) => String(r.app_slug)),
      );
      const apps = (accounts as any[]).map((a) => ({
        app: String(a.app_slug),
        account_id: String(a.account_id),
        account_name: a.account_name ?? null,
        healthy: a.healthy !== false,
        enabled: !disabled.has(String(a.app_slug)),
      }));
      return ok({ configured: true, apps });
    }

    case "actions": {
      const app = payload.app?.trim();
      if (!app) return fail(400, "Missing app");
      const body = await providerFetch(cfg, "/actions", { query: { app, limit: "100" } });
      const list: any[] = Array.isArray(body?.data) ? body.data : [];
      return ok({ app, tools: list.map((a) => toTool(a, app)) });
    }

    case "props": {
      if (!payload.tool) return fail(400, "Missing tool");
      const body = await providerFetch(cfg, "/actions/configure", {
        method: "POST",
        body: {
          external_user_id: userId,
          id: payload.tool,
          prop_name: payload.prop_name,
          configured_props: payload.configured_props ?? {},
          query: payload.query,
        },
      });
      return ok({ result: body });
    }

    case "run": {
      if (!payload.tool) return fail(400, "Missing tool");
      const app = payload.app?.trim();
      if (app) {
        const { data: setting } = await supabase
          .from("pipedream_tool_settings")
          .select("enabled")
          .eq("user_id", userId)
          .eq("app_slug", app)
          .maybeSingle();
        if (setting && (setting as any).enabled === false) {
          return fail(403, "This app is turned off for the assistant");
        }
      }
      const body = await providerFetch(cfg, "/actions/run", {
        method: "POST",
        body: {
          external_user_id: userId,
          id: payload.tool,
          configured_props: payload.configured_props ?? {},
        },
      });
      return ok({ result: body?.ret ?? body, exports: body?.exports ?? null, logs: body?.os ?? null });
    }

    case "set_enabled": {
      const app = payload.app?.trim();
      if (!app) return fail(400, "Missing app");
      const { error } = await supabase.from("pipedream_tool_settings").upsert(
        {
          user_id: userId,
          app_slug: app,
          enabled: payload.enabled !== false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,app_slug" },
      );
      if (error) return fail(500, error.message);
      return ok({ app, enabled: payload.enabled !== false });
    }

    default:
      return fail(400, "Unknown action");
  }
}
