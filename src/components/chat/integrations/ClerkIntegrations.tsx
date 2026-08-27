/** @doc App accounts linked through the identity broker (Clerk).
 *
 *  Connecting an app creates/extends the broker session and stores the OAuth
 *  grant there — tokens never reach the browser. The assistant reads the list
 *  of connected apps through the turn context.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useSignIn, useUser } from "@clerk/clerk-react";
import { Check, Loader2, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CLERK_INTEGRATIONS, clerkEnabled } from "@/lib/clerk/config";
import { clerkApi } from "@/lib/clerk/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

function Inner() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signIn } = useSignIn();
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const redirect = useMemo(
    () => (typeof window === "undefined" ? "/" : `${window.location.origin}/auth/apple-callback`),
    [],
  );

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setConnected([]);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await clerkApi("list_integrations", token);
      setConnected((res.accounts ?? []).map((a) => a.provider));
      notifyTurnContextChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (isLoaded) void refresh();
  }, [isLoaded, refresh]);

  async function connect(provider: string) {
    setBusy(provider);
    try {
      if (isSignedIn && user) {
        const account = await user.createExternalAccount({
          strategy: `oauth_${provider}` as never,
          redirectUrl: redirect,
        });
        const url = account.verification?.externalVerificationRedirectURL?.toString();
        if (url) window.location.href = url;
      } else if (signIn) {
        await signIn.authenticateWithRedirect({
          strategy: `oauth_${provider}` as never,
          redirectUrl: redirect,
          redirectUrlComplete: redirect,
        });
      }
    } catch (err) {
      toast.error((err as Error).message || "Could not connect this app");
      setBusy(null);
    }
  }

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
        <p className="text-[12px] text-foreground/40">Linked app accounts</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1 text-[12px] text-foreground/45"
          style={{ border: 0, background: "transparent" }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {CLERK_INTEGRATIONS.map((item) => {
        const isOn = connected.includes(item.provider);
        return (
          <div key={item.provider} className="flex items-center gap-3 rounded-[14px] px-2 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-foreground/[0.06]">
              <Plug className="h-4 w-4 text-foreground/60" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-foreground">{item.label}</p>
              <p className="truncate text-[11.5px] text-foreground/45">{item.description}</p>
            </div>
            {isOn ? (
              <span className="flex items-center gap-1 text-[12px] text-foreground/55">
                <Check className="h-3.5 w-3.5" /> Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void connect(item.provider)}
                disabled={busy === item.provider}
                className="rounded-full bg-foreground/[0.08] px-3 py-1.5 text-[12.5px] text-foreground"
                style={{ border: 0 }}
              >
                {busy === item.provider ? "Opening…" : "Connect"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ClerkIntegrations() {
  if (!clerkEnabled) {
    return (
      <p className="px-2 py-6 text-center text-[13px] text-foreground/45">
        App accounts are not enabled yet.
      </p>
    );
  }
  return <Inner />;
}
