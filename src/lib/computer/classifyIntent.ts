/**
 * @doc Model-backed router for "does this turn need a real computer?".
 * The regex heuristic stays as the instant fast path / fallback; whenever it is
 * unsure we ask the model for a tiny JSON verdict so odd phrasings, dialects
 * and follow-ups still reach the computer agent.
 */
import { streamChat } from "@/lib/streamChat";
import { DEFAULT_MODEL } from "@/lib/defaultModel";
import { isAffirmation, shouldUseComputer } from "./shouldUseComputer";

export interface ComputerIntent {
  /** Run this turn on the computer agent. */
  use: boolean;
  /** Normalized task text to hand to the agent. */
  task: string;
  /** Where the verdict came from (debugging / telemetry). */
  source: "explicit" | "heuristic" | "model" | "continuation" | "none";
}

const SYSTEM = [
  "You route chat turns for an AI assistant that owns a real cloud computer (browser + terminal).",
  "Answer with JSON only: {\"use_computer\": boolean, \"task\": string, \"reason\": string}.",
  "use_computer = true when the user wants something DONE on the web or a machine:",
  "opening/visiting a site, signing up or logging in, filling forms, buying/booking,",
  "downloading or scraping data, checking a live page, running commands, or continuing such a task.",
  "use_computer = false for pure conversation, explanations, writing, coding help, math, or image/video/slides requests.",
  "task = the user's request rewritten as one short imperative instruction, in the user's own language.",
].join(" ");

async function askModel(text: string): Promise<{ use: boolean; task: string } | null> {
  let out = "";
  try {
    await streamChat({
      messages: [
        { role: "user", content: `${SYSTEM}\n\nUser message:\n${text}\n\nJSON:` },
      ],
      model: DEFAULT_MODEL,
      searchEnabled: false,
      chatMode: "normal",
      onDelta: (d) => {
        out += d || "";
      },
      onDone: () => {},
      onError: () => {},
    });
  } catch {
    return null;
  }
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { use_computer?: boolean; task?: string };
    return {
      use: parsed.use_computer === true,
      task: (parsed.task || "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Decides how a chat turn should be routed.
 * `pendingIntent` is the last computer-flavoured request in this conversation,
 * so short confirmations ("تمام يلا", "ok") continue the same task.
 */
export async function routeComputerIntent(
  text: string,
  pendingIntent?: string | null,
): Promise<ComputerIntent> {
  const raw = (text || "").trim();
  if (!raw) return { use: false, task: "", source: "none" };

  if (/(^|\s)@computer\b/i.test(raw)) {
    return { use: true, task: raw, source: "explicit" };
  }

  if (pendingIntent && isAffirmation(raw)) {
    return { use: true, task: `${pendingIntent}\n\n${raw}`, source: "continuation" };
  }

  if (shouldUseComputer(raw)) {
    return { use: true, task: raw, source: "heuristic" };
  }

  // Only worth a model round-trip when the message reads like a request.
  if (raw.length < 12) return { use: false, task: raw, source: "none" };

  const verdict = await askModel(raw);
  if (verdict?.use) {
    return { use: true, task: verdict.task || raw, source: "model" };
  }
  return { use: false, task: raw, source: "none" };
}
