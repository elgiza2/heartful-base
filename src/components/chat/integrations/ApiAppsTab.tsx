/** @doc "APIs" tab — ready-made apps that only need the user's own API key.
 *  Flat rows (logo + name + short line), connected ones first.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API_APPS } from "@/lib/apiApps/catalog";
import type { ApiApp } from "@/lib/apiApps/types";
import { listApiApps, type ApiAppRow } from "@/lib/apiApps/client";
import ApiAppLogo from "./ApiAppLogo";

export default function ApiAppsTab({
  query = "",
  onOpen,
  reloadKey = 0,
}: {
  query?: string;
  onOpen: (app: ApiApp) => void;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<ApiAppRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listApiApps()
      .then((r) => alive && setRows(r))
      .catch((e: any) => {
        if (alive) setRows([]);
        if (e?.message) toast.error(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const connectedIds = useMemo(() => new Set(rows.map((r) => r.app_id)), [rows]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? API_APPS.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.category.includes(q),
        )
      : API_APPS;
    return [...base].sort((a, b) => {
      const ac = connectedIds.has(a.id) ? 0 : 1;
      const bc = connectedIds.has(b.id) ? 0 : 1;
      return ac - bc || a.name.localeCompare(b.name);
    });
  }, [query, connectedIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-foreground/40">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <div dir="ltr" className="pb-3">
      <p className="px-2 pb-1 pt-2 text-[12px] text-foreground/40">
        Add your own key and the app works instantly
      </p>
      {list.map((app) => {
        const connected = connectedIds.has(app.id);
        return (
          <button
            key={app.id}
            type="button"
            onClick={() => onOpen(app)}
            className="flex w-full items-center gap-3 px-2 py-2.5 text-left active:opacity-60"
            style={{ border: 0, background: "transparent", minHeight: 58 }}
          >
            <ApiAppLogo app={app} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-foreground">
                {app.name}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] leading-[1.5] text-foreground/40">
                {connected ? `Connected · ${app.tools.length} tools` : app.description}
              </span>
            </span>
            {connected && <Check className="h-[18px] w-[18px] shrink-0 text-foreground/60" />}
          </button>
        );
      })}
      {list.length === 0 && (
        <p className="py-8 text-center text-[13px] text-foreground/40">No results</p>
      )}
    </div>
  );
}
