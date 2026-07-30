const test = require("node:test");
const assert = require("node:assert/strict");

const { accountFeaturesEnabled, authDisabled } = require("../../src/config/accountFeatures.cjs");

test("account features are disabled by default", () => {
  assert.equal(accountFeaturesEnabled({}), false);
  assert.equal(authDisabled({}), true);
});

test("account features require an explicit enable flag", () => {
  assert.equal(accountFeaturesEnabled({ VITE_ACCOUNT_FEATURES_ENABLED: "true" }), true);
  assert.equal(accountFeaturesEnabled({ ACCOUNT_FEATURES_ENABLED: "1" }), true);
});

test("legacy auth-disable flags override the account enable flag", () => {
  assert.equal(
    accountFeaturesEnabled({
      VITE_ACCOUNT_FEATURES_ENABLED: "true",
      AUTH_DISABLED: "true",
    }),
    false
  );
});

test("feature flags can be composed from build and runtime sources", () => {
  assert.equal(
    accountFeaturesEnabled(
      { VITE_ACCOUNT_FEATURES_ENABLED: "" },
      { VITE_ACCOUNT_FEATURES_ENABLED: "yes" }
    ),
    true
  );
});
