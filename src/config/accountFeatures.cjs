const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnabled(value) {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function accountFeaturesEnabled(...sources) {
  const values = Object.assign({}, ...sources.filter(Boolean));

  const explicitlyDisabled =
    isEnabled(values.VITE_AUTH_DISABLED) ||
    isEnabled(values.AUTH_DISABLED) ||
    isEnabled(values.VITE_DISABLE_AUTH) ||
    isEnabled(values.DISABLE_AUTH);

  if (explicitlyDisabled) return false;

  return (
    isEnabled(values.VITE_ACCOUNT_FEATURES_ENABLED) ||
    isEnabled(values.ACCOUNT_FEATURES_ENABLED)
  );
}

function authDisabled(...sources) {
  return !accountFeaturesEnabled(...sources);
}

module.exports = {
  accountFeaturesEnabled,
  authDisabled,
};
