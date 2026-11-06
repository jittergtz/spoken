const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/dockPolicy.js");

test("the Dock icon follows the control panel", async () => {
  const { resolveDockVisibility } = await load();

  assert.equal(resolveDockVisibility({ platform: "darwin", controlPanelVisible: true }), true);
  assert.equal(resolveDockVisibility({ platform: "darwin", controlPanelVisible: false }), false);
});

test("hiding the dictation panel cannot resurrect the Dock icon", async () => {
  const { resolveDockVisibility } = await load();

  // Regression guard for #428: the auto-hide-when-idle cycle ended every
  // dictation with an app.dock.show(), a leftover from when the macOS branch
  // minimized the panel into the Dock instead of hiding it. The dictation panel
  // is not the control panel, so it cannot affect the icon either way.
  assert.equal(resolveDockVisibility({ platform: "darwin", controlPanelVisible: false }), false);
});

test("there is no Dock to act on outside macOS", async () => {
  const { resolveDockVisibility } = await load();

  for (const platform of ["win32", "linux"]) {
    assert.equal(resolveDockVisibility({ platform, controlPanelVisible: true }), null);
  }
});

test("clicking the pill or its quick settings does not open the control panel", async () => {
  const { isOverlayActivation } = await load();

  for (const bounds of [
    { x: 800, y: 850, width: 240, height: 280 },
    { x: 720, y: 630, width: 400, height: 500 },
    { x: -1600, y: 200, width: 400, height: 500 },
  ]) {
    assert.equal(
      isOverlayActivation({
        overlayVisible: true,
        overlayInteractive: true,
        bounds,
        cursor: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 20 },
      }),
      true
    );
  }
});

test("Dock clicks still open the app while quick settings are open", async () => {
  const { isOverlayActivation } = await load();
  const bounds = { x: 720, y: 630, width: 400, height: 500 };
  assert.equal(
    isOverlayActivation({
      overlayVisible: true,
      overlayInteractive: true,
      bounds,
      cursor: { x: 920, y: 1160 },
    }),
    false
  );
});

test("a hidden or click-through pill does not suppress app activation", async () => {
  const { isOverlayActivation } = await load();
  const geometry = {
    bounds: { x: 720, y: 630, width: 400, height: 500 },
    cursor: { x: 920, y: 1100 },
  };
  assert.equal(
    isOverlayActivation({ ...geometry, overlayVisible: false, overlayInteractive: true }),
    false
  );
  assert.equal(
    isOverlayActivation({ ...geometry, overlayVisible: true, overlayInteractive: false }),
    false
  );
  assert.equal(isOverlayActivation({ overlayVisible: false, overlayInteractive: false }), false);
});
