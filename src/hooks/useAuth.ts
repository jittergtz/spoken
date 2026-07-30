import { useEffect, useRef } from "react";
import { authClient, isWithinGracePeriod } from "../lib/auth";
import logger from "../utils/logger";
import { useSettingsStore } from "../stores/settingsStore";
import { AUTH_DISABLED } from "../lib/features";

const useStaticSession = () => ({
  data: null,
  isPending: false,
  error: null,
  refetch: async () => null,
});

export function useAuth() {
  // Selecting the static hook here prevents Better Auth from issuing session
  // requests at all in accountless builds while preserving a stable hook order.
  const useSession = AUTH_DISABLED
    ? useStaticSession
    : (authClient?.useSession ?? useStaticSession);
  const { data: session, isPending } = useSession();
  const user = session?.user ?? null;
  const rawIsSignedIn = Boolean(user);
  const gracePeriodActive = isWithinGracePeriod();

  // Only sync true to the store — signOut() handles setting false via localStorage + reload.
  // Better Auth's useSession() flickers in Electron (renderer can't see the main-process cookie until reload).
  const isSignedIn = rawIsSignedIn || gracePeriodActive;

  const lastSyncedRef = useRef(false);

  useEffect(() => {
    if (AUTH_DISABLED) {
      useSettingsStore.getState().setIsSignedIn(false);
      return;
    }
    if (!isPending && isSignedIn && !lastSyncedRef.current) {
      logger.debug(
        "Auth state sync",
        { isSignedIn, rawIsSignedIn, gracePeriod: gracePeriodActive },
        "auth"
      );
      useSettingsStore.getState().setIsSignedIn(true);
      lastSyncedRef.current = true;
    }
  }, [isSignedIn, rawIsSignedIn, gracePeriodActive, isPending]);

  if (AUTH_DISABLED) {
    return {
      isSignedIn: false,
      isGracePeriodOnly: false,
      isLoaded: true,
      session: null,
      user: null,
      authDisabled: true,
    };
  }

  return {
    isSignedIn,
    isGracePeriodOnly: !rawIsSignedIn && gracePeriodActive,
    isLoaded: !isPending,
    session,
    user,
    authDisabled: false,
  };
}
