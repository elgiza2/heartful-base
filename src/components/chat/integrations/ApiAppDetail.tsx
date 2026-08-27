/** @doc Detail view of one ready-made API app: key setup + its tools list. */
import { useEffect, useState } from "react";
import { ArrowUpLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ApiApp } from "@/lib/apiApps/types";
import { listApiApps, removeApiApp, saveApiAppKey, setApiAppEnabled } from "@/lib/apiApps/client";
import ApiAppLogo from "./ApiAppLogo";
import ToolsList from "./ToolsList";

export default function ApiAppDetail({
  app,
  onBack,
  onChanged,
  onUse,
}: {
  app: ApiApp;
  onBack: () => void;
  onChanged?: () => void;
  onUse?: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const rows = await listApiApps();
      const row = rows.find((r) => r.app_id === app.id);
      setHint(row?.key_hint ?? null);
      setEnabled(row ? row.enabled : true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  const save = async () => {
    setSaving(true);
    try {
      await saveApiAppKey(app.id, value);
      setValue("");
      await load();
      onChanged?.();
      toast.success(`${app.name} is ready`);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the key");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await removeApiApp(app.id);
      setHint(null);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    }
  };

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await setApiAppEnabled(app.id, next);
      onChanged?.();
    } catch (e: any) {
      setEnabled(!next);
      toast.error(e?.message || "Couldn't save");
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative flex shrink-0 items-center justify-between pb-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-foreground/70"
          style={{ border: 0 }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold text-foreground">{app.name}</span>
        <span className="h-8 w-8" />
      </div>

      <div className="flex flex-col items-center pt-4 text-center">
        <ApiAppLogo app={app} size={72} />
        <h3 className="mt-3 text-[19px] font-semibold text-foreground">{app.name}</h3>
        <p dir="ltr" className="mt-2 max-w-[34ch] text-[13px] leading-[1.7] text-foreground/50">
          {app.description}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-foreground/40">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : hint ? (
        <div dir="ltr" className="mt-5">
          <div className="flex items-center justify-between gap-2 px-2 py-3">
            <span className="truncate text-[13.5px] text-foreground/70">Key {hint}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`Use ${app.name} in chat`}
                onClick={() => void toggle()}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-primary" : "bg-foreground/15"
                }`}
                style={{ border: 0 }}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${
                    enabled ? "start-[18px]" : "start-0.5"
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                aria-label="Remove key"
                className="text-destructive"
                style={{ border: 0, background: "transparent" }}
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div dir="ltr" className="mt-5">
          <button
            type="button"
            onClick={() => window.open(app.keyUrl, "_blank", "noopener")}
            className="flex w-full items-center justify-between bg-transparent px-2 py-3 text-left"
            style={{ border: 0 }}
          >
            <span className="text-[13.5px] text-foreground/70">Get your API key</span>
            <ArrowUpLeft className="h-[18px] w-[18px] text-foreground/40" />
          </button>
          <div className="flex items-center gap-2 px-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full flex-1 text-[14px] text-foreground outline-none placeholder:text-foreground/35"
              style={{
                border: 0,
                background: "transparent",
                boxShadow: "none",
                borderRadius: 0,
                padding: 0,
              }}
            />
            <button
              type="button"
              disabled={saving || value.trim().length < 6}
              onClick={() => void save()}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-[12px] bg-foreground px-4 text-[13.5px] font-semibold text-background disabled:opacity-40"
              style={{ border: 0 }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      )}

      <ToolsList
        title="Tools"
        tools={app.tools.map((t) => ({
          key: `${app.id}:${t.name}`,
          name: t.name,
          description: t.description,
        }))}
        onPick={(tool) => {
          window.dispatchEvent(
            new CustomEvent("megsy:composer-insert", {
              detail: { text: `Use ${app.name} → ${tool.name}: ` },
            }),
          );
          onUse?.();
        }}
      />

      <div dir="ltr" className="mt-6 pb-2">
        <button
          type="button"
          onClick={() => window.open(app.docsUrl, "_blank", "noopener")}
          className="flex w-full items-center justify-between bg-transparent px-2 py-3 text-left"
          style={{ border: 0 }}
        >
          <span className="text-[13px] text-foreground/45">Documentation</span>
          <ArrowUpLeft className="h-[18px] w-[18px] text-foreground/40" />
        </button>
      </div>
    </div>
  );
}
