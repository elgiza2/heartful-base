/** @doc Serverless endpoint for the connected-apps tool gateway. */
import { handleToolsGateway, type ToolsPayload } from "../src/lib/pipedream/gatewayCore";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
  }

  const body = (await req.json().catch(() => null)) as ToolsPayload | null;
  try {
    const result = await handleToolsGateway(body);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "tools_failed" }),
      { status: 500, headers },
    );
  }
}
