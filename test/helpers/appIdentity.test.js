const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { resolveUserDataPath } = require("../../src/helpers/appIdentity");

const appData = path.resolve("profiles");
const profile = (name) => path.join(appData, name);
const existing =
  (...names) =>
  (candidate) =>
    names.map(profile).includes(candidate);

test("fresh installs get Ducky profiles isolated by channel", () => {
  for (const channel of ["production", "development", "staging"]) {
    const name = channel === "production" ? "Ducky" : `Ducky-${channel}`;
    assert.equal(resolveUserDataPath(appData, channel, existing()), profile(name));
  }
});

test("the rename preserves existing production data with either legacy casing", () => {
  for (const name of ["spoken", "Spoken"]) {
    assert.equal(resolveUserDataPath(appData, "production", existing(name)), profile(name));
  }
});

test("development and staging reuse only their own legacy profiles", () => {
  assert.equal(
    resolveUserDataPath(appData, "development", existing("Spoken-development", "Spoken")),
    profile("Spoken-development")
  );
  assert.equal(
    resolveUserDataPath(appData, "staging", existing("spoken-staging", "Spoken-development")),
    profile("spoken-staging")
  );
  assert.equal(
    resolveUserDataPath(appData, "development", existing("Spoken", "spoken-staging")),
    profile("Ducky-development")
  );
});

test("an existing Ducky profile takes priority over legacy profiles", () => {
  assert.equal(
    resolveUserDataPath(appData, "production", existing("Ducky", "spoken", "Spoken")),
    profile("Ducky")
  );
});
