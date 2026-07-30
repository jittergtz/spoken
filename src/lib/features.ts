import { authDisabled } from "../config/accountFeatures";

export function checkIsAuthDisabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      if ((window as any).electronAPI?.isAuthDisabledSync?.()) return true;
    } catch {}

    const storedFlags: Record<string, string> = {};
    try {
      for (const key of [
        "VITE_ACCOUNT_FEATURES_ENABLED",
        "ACCOUNT_FEATURES_ENABLED",
        "VITE_AUTH_DISABLED",
        "AUTH_DISABLED",
        "VITE_DISABLE_AUTH",
        "DISABLE_AUTH",
      ]) {
        const value = localStorage.getItem(key);
        if (value !== null) storedFlags[key] = value;
      }
    } catch {}

    return authDisabled(import.meta.env, storedFlags);
  }

  return authDisabled(import.meta.env);
}

export const AUTH_DISABLED = checkIsAuthDisabled();
export const ACCOUNT_FEATURES_ENABLED = !AUTH_DISABLED;
export const WORKSPACES_ENABLED =
  ACCOUNT_FEATURES_ENABLED && import.meta.env.VITE_WORKSPACES_ENABLED === "true";
export const SHARING_ENABLED =
  ACCOUNT_FEATURES_ENABLED && import.meta.env.VITE_SHARING_ENABLED === "true";
