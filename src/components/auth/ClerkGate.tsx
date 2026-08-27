/** @doc Mounts ClerkProvider only when a publishable key is configured.
 *  Without a key the app renders exactly as before — Clerk features simply
 *  stay hidden instead of crashing the tree.
 */
import { type ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { clerkEnabled, clerkPublishableKey } from "@/lib/clerk/config";

export default function ClerkGate({ children }: { children: ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}
