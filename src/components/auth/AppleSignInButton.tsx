/** @doc Sign in with Apple, brokered by Clerk and bridged into the app account.
 *  Hidden entirely when Clerk is not configured.
 */
import { useState } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { Apple, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clerkEnabled } from "@/lib/clerk/config";

function AppleButtonInner() {
  const { signIn, isLoaded } = useSignIn();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_apple",
        redirectUrl: `${window.location.origin}/auth/apple-callback`,
        redirectUrlComplete: `${window.location.origin}/auth/apple-callback`,
      });
    } catch (err) {
      setBusy(false);
      toast.error((err as Error).message || "Apple sign-in is unavailable");
    }
  }

  return (
    <Button variant="secondary" className="w-full" onClick={() => void start()} disabled={busy || !isLoaded}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Apple className="mr-2 h-4 w-4" />}
      Continue with Apple
    </Button>
  );
}

export default function AppleSignInButton() {
  if (!clerkEnabled) return null;
  return <AppleButtonInner />;
}
