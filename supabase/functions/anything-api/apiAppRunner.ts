/** Executor for ready-made API apps (bring-your-own-key).
 *
 * The registry pins the host, auth style and allowed endpoints for every app,
 * so a request can never be pointed at an arbitrary URL.
 */
import { API_APP_REGISTRY } from "./apiAppRegistry.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export async function handleApiApp(
  req: Request,
  admin: any,
  body: any,
): Promise<Response> {
  const action = String(body?.action ?? "run");
  const token = String(
    body?.token ?? (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""),
  );
  const { data: userData } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return reply({ ok: false, error: "Sign in first" }, 401);

  if (action !== "run") return reply({ ok: false, error: "Unknown action" }, 400);

  const appId = String(body?.app ?? "");
  const app = API_APP_REGISTRY[appId];
  if (!app) return reply({ ok: false, error: "Unknown app" }, 400);

  const tool = app.tools.find((t) => t.name === String(body?.tool ?? ""));
  if (!tool) return reply({ ok: false, error: "Unknown tool" }, 400);

  const { data: row } = await admin
    .from("user_api_apps")
    .select("key_value, enabled")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .maybeSingle();
  const key = (row as any)?.key_value;
  if (!key) return reply({ ok: false, error: `Add your ${app.name} key first` }, 400);
  if ((row as any)?.enabled === false) {
    return reply({ ok: false, error: `${app.name} is turned off` }, 400);
  }

  const params: Record<string, unknown> = { ...(body?.params ?? {}) };

  // Path params
  let path = tool.path;
  for (const [k, v] of Object.entries(params)) {
    if (path.includes(`{${k}}`)) {
      path = path.replace(`{${k}}`, encodeURIComponent(String(v)));
      delete params[k];
    }
  }

  const url = new URL(app.baseUrl.replace(/\/$/, "") + path);
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: string | undefined;

  if (app.auth.type === "header") {
    headers[app.auth.name] = `${app.auth.prefix ?? ""}${key}`;
  } else {
    url.searchParams.set(app.auth.name, key);
  }

  const bodyParams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    const spec = tool.params.find((p) => p.name === k);
    if (tool.method === "POST" && (!spec || spec.in === "body")) bodyParams[k] = v;
    else url.searchParams.set(k, String(v));
  }
  if (tool.method === "POST") {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(bodyParams);
  }

  try {
    const res = await fetch(url.toString(), {
      method: tool.method,
      headers,
      body: payload,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
    if (!res.ok) {
      return reply({ ok: false, error: `${app.name} returned ${res.status}`, result: parsed }, 200);
    }
    return reply({ ok: true, app: appId, tool: tool.name, result: parsed });
  } catch (e) {
    return reply({ ok: false, error: e instanceof Error ? e.message : "request_failed" }, 500);
  }
}
