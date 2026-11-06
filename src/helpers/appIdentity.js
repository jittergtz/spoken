const path = require("path");
const fs = require("fs");

const APP_NAME = "Ducky";
const APP_ID = "com.gizmolabs.ducky";

// Reuse an existing profile in place so SQLite, localStorage, audio, and
// encrypted credentials survive the rename. Fresh installs use Ducky paths.
function resolveUserDataPath(appData, channel, exists = fs.existsSync) {
  const names =
    channel === "production"
      ? [APP_NAME, "Waddle", "spoken", "Spoken"]
      : [`${APP_NAME}-${channel}`, `Waddle-${channel}`, `Spoken-${channel}`, `spoken-${channel}`];
  const candidates = names.map((name) => path.join(appData, name));
  return candidates.find((candidate) => exists(candidate)) || candidates[0];
}

function getAppIconPath() {
  const { app } = require("electron");
  return app.isPackaged
    ? path.join(process.resourcesPath, "src", "assets", "icon.png")
    : path.join(__dirname, "..", "assets", "icon.png");
}

module.exports = { APP_NAME, APP_ID, resolveUserDataPath, getAppIconPath };
