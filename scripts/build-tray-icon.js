#!/usr/bin/env node
// Rasterize the vector master with Electron's SVG renderer, without extra tools.
const fs = require("fs");
const path = require("path");

if (!process.versions.electron) {
  const { execFileSync } = require("child_process");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  execFileSync(require("electron"), [__filename], { env, stdio: "inherit" });
} else {
  const { app, BrowserWindow } = require("electron");
  const assets = path.join(__dirname, "..", "src", "assets");

  app
    .whenReady()
    .then(async () => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      try {
        await window.loadURL("data:text/html,<html></html>");
        const svg = fs.readFileSync(path.join(assets, "ducky-tray.svg"), "utf8");
        const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        for (const scale of [1, 2, 3]) {
          const size = 18 * scale;
          const dataUrl = await window.webContents.executeJavaScript(`
          (async () => {
            const image = new Image();
            image.src = ${JSON.stringify(source)};
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = ${size};
            canvas.getContext("2d").drawImage(image, 0, 0, ${size}, ${size});
            return canvas.toDataURL("image/png");
          })()
        `);
          const suffix = scale === 1 ? "" : `@${scale}x`;
          fs.writeFileSync(
            path.join(assets, `iconTemplate${suffix}.png`),
            Buffer.from(dataUrl.split(",")[1], "base64")
          );
        }
        console.log("Generated Ducky menu bar template PNGs (18, 36, and 54 pixels).");
      } finally {
        window.destroy();
        app.quit();
      }
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
