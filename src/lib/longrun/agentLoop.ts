/**
 * @doc Server-only agent loop for long runs.
 *
 * Each invocation advances the run by a bounded number of steps (so it always
 * fits inside a serverless request) and persists every step as an event, so
 * the next invocation — driven by the client keep-alive or by a Trigger.dev
 * task — resumes exactly where this one stopped. That is what lets a single
 * run span 20h+ without any single long-lived process.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MODEL } from "../defaultModel";

/** Wall-clock budget for one invocation of the loop. */
const SLICE_MS = 45_000;
/** Max steps per invocation (whichever limit hits first). */
const SLICE_STEPS = 4;

const SYSTEM = `You are Megsy Computer, an autonomous agent driving a real Ubuntu desktop with a browser, a terminal and a filesystem.

You work in small steps. On every turn you receive the goal and the log of what already happened, and you reply with ONE action as strict JSON, nothing else:

{"thought":"<one short sentence>","action":"bash","command":"<shell command>"}
{"thought":"...","action":"open","url":"https://..."}
{"thought":"...","action":"type","text":"..."}
{"thought":"...","action":"key","key":"Return"}
{"thought":"...","action":"click","x":123,"y":456}
{"thought":"...","action":"wait","seconds":3}
{"thought":"...","action":"done","summary":"<what was achieved, for the user>"}

Rules:
- Prefer "bash" for anything scriptable (installing, files, curl, git, running code); use the GUI only when the task truly needs a browser UI (logins, signups, sites without an API).
- Never repeat an action that already failed the same way twice; change strategy instead.
- Never ask the user questions; decide and continue.
- Finish with "done" as soon as the goal is achieved, and make the summary useful on its own.
- Output JSON only, no markdown fences.`;

interface AgentAction {
  thought?: string;
  action?: string;
  command?: string;
  url?: string;
  text?: string;
  key?: string;
  x?: number;
  y?: number;
  seconds?: number;
  summary?: string;
}

async function askModel(token: string, goal: string, log: string[]): Promise<AgentAction | null> {
  const url = `${process.env.SUPABASE_URL}/functions/v1/chat-alibaba`;
  const prompt = [
    `GOAL: ${goal}`,
    log.length ? `LOG (most recent last):\n${log.slice(-24).join("\n")}` : "LOG: (empty — this is the first step)",
    "Reply with the next action as JSON only.",
  ].join("\n\n");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model: DEFAULT_MODEL,
      chatMode: "normal",
      customSystem: SYSTEM,
    }),
  });
  if (!resp.ok || !resp.body) return null;

  // The chat endpoint streams SSE deltas; accumulate them into one text blob.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const j = JSON.parse(raw);
        out += j?.choices?.[0]?.delta?.content ?? j?.delta ?? j?.content ?? "";
      } catch {
        /* keepalive / non-JSON frame */
      }
    }
  }

  const match = out.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as AgentAction;
  } catch {
    return null;
  }
}

type Desktop = {
  commands: { run: (cmd: string, opts?: any) => Promise<{ stdout?: string; stderr?: string }> };
  moveMouse: (x: number, y: number) => Promise<void>;
  leftClick: () => Promise<void>;
  write: (text: string) => Promise<void>;
  press: (key: string) => Promise<void>;
  setTimeout: (ms: number) => Promise<void>;
};

async function connect(sandboxId: string, apiKey: string): Promise<Desktop> {
  const { Sandbox } = await import("@e2b/desktop");
  return (await Sandbox.connect(sandboxId, { apiKey })) as unknown as Desktop;
}

/** Runs one bounded slice of the agent loop. Returns true when the run finished. */
export async function advanceRun(
  db: SupabaseClient,
  run: { id: string; goal: string; sandbox_id: string | null },
  token: string,
  apiKey: string,
): Promise<boolean> {
  if (!run.sandbox_id) return false;

  const { data: prior } = await db
    .from("long_run_events")
    .select("type,title,detail")
    .eq("run_id", run.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const log: string[] = (prior ?? [])
    .filter((e: any) => e.type === "step" || e.type === "result")
    .map((e: any) => `- ${e.title}${e.detail ? `: ${String(e.detail).slice(0, 400)}` : ""}`);

  let desktop: Desktop;
  try {
    desktop = await connect(run.sandbox_id, apiKey);
  } catch (e) {
    await db.from("long_run_events").insert({
      run_id: run.id,
      type: "warn",
      title: "Reconnecting to the computer…",
      detail: e instanceof Error ? e.message : null,
    });
    return false;
  }

  const started = Date.now();
  for (let i = 0; i < SLICE_STEPS && Date.now() - started < SLICE_MS; i++) {
    const act = await askModel(token, run.goal, log);
    if (!act?.action) break;

    if (act.action === "done") {
      const summary = act.summary || "Task finished.";
      await db.from("long_run_events").insert({
        run_id: run.id,
        type: "result",
        title: "Task finished",
        detail: summary,
      });
      await db
        .from("long_runs")
        .update({
          status: "done",
          status_text: "Finished",
          result: summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return true;
    }

    let detail = "";
    try {
      switch (act.action) {
        case "bash": {
          const res = await desktop.commands.run(act.command || "true", { timeoutMs: 120_000 });
          detail = `${res.stdout ?? ""}${res.stderr ?? ""}`.slice(0, 2000);
          break;
        }
        case "open":
          await desktop.commands.run(
            `DISPLAY=:0 nohup xdg-open ${JSON.stringify(act.url || "about:blank")} >/dev/null 2>&1 &`,
          );
          detail = act.url || "";
          break;
        case "click":
          await desktop.moveMouse(Number(act.x) || 0, Number(act.y) || 0);
          await desktop.leftClick();
          detail = `(${act.x}, ${act.y})`;
          break;
        case "type":
          await desktop.write(act.text || "");
          detail = (act.text || "").slice(0, 200);
          break;
        case "key":
          await desktop.press(act.key || "Return");
          detail = act.key || "";
          break;
        case "wait":
          await new Promise((r) => setTimeout(r, Math.min(15, Number(act.seconds) || 2) * 1000));
          break;
        default:
          detail = `unsupported action: ${act.action}`;
      }
    } catch (e) {
      detail = `error: ${e instanceof Error ? e.message : "failed"}`;
    }

    const title = (act.thought || act.action).slice(0, 300);
    log.push(`- ${title}${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    await db.from("long_run_events").insert({
      run_id: run.id,
      type: "step",
      title,
      detail: detail || null,
    });
    await db
      .from("long_runs")
      .update({ status_text: title, phase: act.action, updated_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  return false;
}
