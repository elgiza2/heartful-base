/** @doc Agent tools for connected apps.
 *
 *  Lists the apps the signed-in user connected, lets them turn each app on or
 *  off for the assistant, and shows the real action catalogue of every app so
 *  it is clear what the assistant can actually do. Tapping an action drops a
 *  ready prompt into the composer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  listAppTools,
  listToolApps,
  setAppToolsEnabled,
  type AppTool,
  type ConnectedToolApp,
} from "@/lib/pipedream/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";
import { integrations as CATALOG } from "@/lib/integrationsData";

const titleFor = (slug: string) =>
  CATALOG.find((i) => i.pipedreamSlug === slug || i.app === slug)?.name ||
  slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AgentTools({ onClose }: { onClose?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [apps, setApps] = useState<ConnectedToolApp[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, AppTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listToolApps();
      setConfigured(res.configured !== false);
      setApps(res.apps ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't load app tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expand = async (app: string) => {
    if (open === app) {
      setOpen(null);
      return;
    }
    setOpen(app);
    if (tools[app]) return;
    setLoadingTools(app);
    try {
      const res = await listAppTools(app);
      setTools((prev) => ({ ...prev, [app]: res.tools ?? [] }));
    } catch (e: any) {
      toast.error(e?.message || "Couldn't load actions");
    } finally {
      setLoadingTools(null);
    }
  };

  const toggle = async (app: ConnectedToolApp) => {
    const next = !app.enabled;
    setApps((prev) => prev.map((a) => (a.app === app.app ? { ...a, enabled: next } : a)));
    try {
      await setAppToolsEnabled(app.app, next);
      notifyTurnContextChanged();
    } catch (e: any) {
      setApps((prev) => prev.map((a) => (a.app === app.app ? { ...a, enabled: app.enabled } : a)));
      toast.error(e?.message || "Couldn't save");
    }
  };

  const useTool = (app: string, tool: AppTool) => {
    window.dispatchEvent(
      new CustomEvent("megsy:composer-insert", {
        detail: { text: `Use ${titleFor(app)} → ${tool.name}: ` },
      }),
    );
    onClose?.();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => titleFor(a.app).toLowerCase().includes(q) || a.app.includes(q));
  }, [apps, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-foreground/40">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!configured) {
    return (
      <p className="px-3 py-8 text-center text-[13px] leading-6 text-foreground/45">
        App tools aren’t set up on the server yet.
      </p>
    );
  }

  if (apps.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[13px] leading-6 text-foreground/45">
        Connect an app from the Apps tab, then its actions show up here as tools the assistant can run for you.
      </p>
    );
  }

  return (
    <div className="pb-3">
      <p className="px-2 pb-2 pt-1 text-[12px] text-foreground/40">
        Actions the assistant can run on your behalf
      </p>

      {apps.length > 4 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter apps"
          className="mb-2 h-10 w-full rounded-[14px] bg-foreground/[0.05] px-3 text-[13px] text-foreground outline-none placeholder:text-foreground/35"
          style={{ border: 0 }}
        />
      )}

      {visible.map((app) => {
        const list = tools[app.app] ?? [];
        const expanded = open === app.app;
        return (
          <div key={app.app} className="mb-1.5 overflow-hidden rounded-[14px] bg-foreground/[0.04]">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => void expand(app.app)}
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
                style={{ border: 0, background: "transparent" }}
              >
                <Wrench className="h-4 w-4 shrink-0 text-foreground/45" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-foreground">{titleFor(app.app)}</span>
                  <span className="block truncate text-[11.5px] text-foreground/40">
                    {app.account_name || (app.healthy ? "Connected" : "Needs reconnect")}
                    {list.length ? ` · ${list.length} actions` : ""}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-foreground/35 transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={app.enabled}
                aria-label={`Use ${titleFor(app.app)} in chat`}
                onClick={() => void toggle(app)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                  app.enabled ? "bg-primary" : "bg-foreground/15"
                }`}
                style={{ border: 0 }}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${
                    app.enabled ? "start-[18px]" : "start-0.5"
                  }`}
                />
              </button>
            </div>

            {expanded && (
              <div className="px-2 pb-2">
                {loadingTools === app.app ? (
                  <div className="flex items-center justify-center py-4 text-foreground/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : list.length === 0 ? (
                  <p className="px-2 py-3 text-[12.5px] text-foreground/40">No actions available for this app.</p>
                ) : (
                  list.slice(0, 40).map((tool) => (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={() => useTool(app.app, tool)}
                      className="block w-full rounded-[12px] px-2.5 py-2 text-start hover:bg-foreground/[0.05]"
                      style={{ border: 0, background: "transparent" }}
                    >
                      <span className="block truncate text-[13px] text-foreground/85">{tool.name}</span>
                      {tool.description && (
                        <span className="block truncate text-[11.5px] text-foreground/40">{tool.description}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
