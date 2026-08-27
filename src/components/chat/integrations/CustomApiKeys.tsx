/**
 * Custom API (bring your own key).
 *
 * Keys are stored per account in `user_provider_keys` and used by the backend
 * for that user's own requests. Service names are intentionally generic —
 * upstream provider names are never shown in the UI.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

type KeyRow = {
  id: string;
  provider: string;
  label: string | null;
  key_hint: string;
  is_enabled: boolean;
};

const SERVICES: { id: string; label: string }[] = [
  { id: "chat", label: "Chat model API" },
  { id: "image", label: "Image API" },
  { id: "video", label: "Video API" },
  { id: "search", label: "Search API" },
  { id: "custom", label: "Other API" },
];

const serviceLabel = (id: string) => SERVICES.find((s) => s.id === id)?.label ?? "Other API";

export default function CustomApiKeys() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState("chat");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("user_provider_keys")
      .select("id, provider, label, key_hint, is_enabled")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as KeyRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    const key = value.trim();
    if (key.length < 8) {
      toast.error("Enter a valid key");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sign in to add a key");
      const { error } = await supabase.from("user_provider_keys").insert({
        user_id: uid,
        provider,
        label: label.trim() || null,
        key_value: key,
        key_hint: `••••${key.slice(-4)}`,
      });
      if (error) throw error;
      setValue("");
      setLabel("");
      setAdding(false);
      await load();
      notifyTurnContextChanged();
      toast.success("Key saved");
    } catch (e: any) {
      toast.error(e?.message || "Could not save the key");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KeyRow) => {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("user_provider_keys").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      void load();
      return;
    }
    notifyTurnContextChanged();
  };

  const toggle = async (row: KeyRow) => {
    const next = !row.is_enabled;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_enabled: next } : r)));
    const { error } = await supabase
      .from("user_provider_keys")
      .update({ is_enabled: next })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      void load();
    }
  };

  return (
    <div dir="ltr" className="pb-4">
      {adding ? (
        <div className="rounded-[14px] bg-foreground/[0.04] p-3">
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setProvider(s.id)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] ${
                  provider === s.id ? "bg-foreground/[0.10] text-foreground" : "text-foreground/55"
                }`}
                style={{ border: 0 }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name (optional)"
            className="mt-3 h-10 w-full rounded-[12px] bg-foreground/[0.05] px-3 text-[14px] text-foreground outline-none placeholder:text-foreground/35"
            style={{ border: 0 }}
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="API key"
            type="password"
            autoComplete="off"
            className="mt-2 h-10 w-full rounded-[12px] bg-foreground/[0.05] px-3 text-[14px] text-foreground outline-none placeholder:text-foreground/35"
            style={{ border: 0 }}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void add()}
              className="h-10 flex-1 rounded-[12px] bg-foreground/[0.10] text-[14px] font-medium text-foreground disabled:opacity-50"
              style={{ border: 0 }}
            >
              {saving ? "Saving…" : "Save key"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-10 rounded-[12px] px-4 text-[14px] text-foreground/55"
              style={{ border: 0 }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-11 w-full items-center gap-2 rounded-[14px] bg-foreground/[0.05] px-3.5 text-[14px] text-foreground"
          style={{ border: 0 }}
        >
          <Plus className="h-4 w-4" />
          Add your own API key
        </button>
      )}

      <div className="mt-3">
        {loading ? (
          <p className="px-2 py-6 text-center text-[13px] text-foreground/40">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-foreground/40">
            No keys yet. Add one to use your own quota.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-foreground">
                  {row.label || serviceLabel(row.provider)}
                </p>
                <p className="truncate text-[12px] text-foreground/40">
                  {serviceLabel(row.provider)} · {row.key_hint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggle(row)}
                className={`rounded-full px-3 py-1.5 text-[12px] ${
                  row.is_enabled ? "bg-foreground/[0.10] text-foreground" : "text-foreground/45"
                }`}
                style={{ border: 0 }}
              >
                {row.is_enabled ? "Active" : "Paused"}
              </button>
              <button
                type="button"
                aria-label="Delete key"
                onClick={() => void remove(row)}
                className="text-foreground/40"
                style={{ border: 0, background: "transparent" }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
