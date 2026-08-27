/** @doc Actions of one connected app, shown inside the connector detail view.
 *  Tapping an action drops a ready prompt into the composer.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listAppTools, type AppTool } from "@/lib/pipedream/client";

export default function AppActionsPanel({
  slug,
  appName,
  onUse,
}: {
  slug: string;
  appName: string;
  onUse?: () => void;
}) {
  const [tools, setTools] = useState<AppTool[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listAppTools(slug)
      .then((res) => {
        if (alive) setTools(res.tools ?? []);
      })
      .catch((e: any) => {
        if (alive) setTools([]);
        toast.error(e?.message || "Couldn't load actions");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-foreground/40">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!tools || tools.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="mb-1 px-2 text-[12.5px] text-foreground/40">{`Actions · ${tools.length}`}</p>
      <div>
        {tools.slice(0, 60).map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("megsy:composer-insert", {
                  detail: { text: `Use ${appName} → ${tool.name}: ` },
                }),
              );
              onUse?.();
            }}
            className="block w-full rounded-[12px] px-2 py-2 text-start active:bg-foreground/[0.05]"
            style={{ border: 0, background: "transparent" }}
          >
            <span className="block truncate text-[13.5px] text-foreground/85">{tool.name}</span>
            {tool.description && (
              <span className="mt-0.5 block truncate text-[11.5px] text-foreground/40">
                {tool.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
