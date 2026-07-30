const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnabled(value: unknown): boolean {
  return TRUE_VALUES.has(
    String(value ?? "")
      .trim()
      .toLowerCase()
  );
}

type FeatureFlagSource = Record<string, unknown> | undefined;

export function accountFeaturesEnabled(...sources: FeatureFlagSource[]): boolean {
  const values = Object.assign({}, ...sources.filter(Boolean));

  const explicitlyDisabled =
    isEnabled(values.VITE_AUTH_DISABLED) ||
    isEnabled(values.AUTH_DISABLED) ||
    isEnabled(values.VITE_DISABLE_AUTH) ||
    isEnabled(values.DISABLE_AUTH);

  if (explicitlyDisabled) return false;

  return (
    isEnabled(values.VITE_ACCOUNT_FEATURES_ENABLED) || isEnabled(values.ACCOUNT_FEATURES_ENABLED)
  );
}

export function authDisabled(...sources: FeatureFlagSource[]): boolean {
  return !accountFeaturesEnabled(...sources);
}
