/** Custom MCP servers the user connected — read from `mcp_connections`. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

type McpRow = {
  id: string;
  name: string;
  url: string;
  state: string;
  enabled: boolean;
  tool_names: string[] | null;
};

export default function CustomMcpList({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<McpRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from("mcp_connections")
      .select("id, name, url, state, enabled, tool_names")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as McpRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (row: McpRow) => {
    const next = !row.enabled;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)));
    const { error } = await supabase.from("mcp_connections").update({ enabled: next }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      void load();
      return;
    }
    notifyTurnContextChanged();
  };

  const openSettings = () => {
    onNavigate?.();
    navigate("/settings/mcp");
  };

  return (
    <div dir="ltr" className="pb-4">
      <button
        type="button"
        onClick={openSettings}
        className="flex h-11 w-full items-center gap-2 rounded-[14px] bg-foreground/[0.05] px-3.5 text-[14px] text-foreground"
        style={{ border: 0 }}
      >
        <Plus className="h-4 w-4" />
        Add an MCP server
      </button>

      <div className="mt-3">
        {loading ? (
          <p className="px-2 py-6 text-center text-[13px] text-foreground/40">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-foreground/40">
            No MCP servers yet. Add one to unlock its tools in chat.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-foreground">{row.name}</p>
                <p className="truncate text-[12px] text-foreground/40">
                  {(row.tool_names?.length ?? 0)} tools · {row.state}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggle(row)}
                className={`rounded-full px-3 py-1.5 text-[12px] ${
                  row.enabled ? "bg-foreground/[0.10] text-foreground" : "text-foreground/45"
                }`}
                style={{ border: 0 }}
              >
                {row.enabled ? "Active" : "Paused"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
