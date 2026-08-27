/** @doc Square logo for a ready-made API app, with a letter fallback. */
import { useState } from "react";
import type { ApiApp } from "@/lib/apiApps/types";

export default function ApiAppLogo({ app, size = 38 }: { app: ApiApp; size?: number }) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.28);

  if (failed || !app.logo) {
    return (
      <span
        className="flex shrink-0 items-center justify-center bg-foreground/[0.06] font-semibold text-foreground/70"
        style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.42 }}
      >
        {app.name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden bg-foreground/[0.04]"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={app.logo}
        alt={app.name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: size * 0.62, height: size * 0.62, objectFit: "contain" }}
      />
    </span>
  );
}
