#!/usr/bin/env node
// Regenerate all shipped icon formats from the supplied Ducky artwork.
// Uses the macOS image tools; no image conversion dependencies are needed.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

if (process.platform !== "darwin") {
  throw new Error("Run icon generation on macOS (requires sips).");
}

const assets = path.join(__dirname, "..", "src", "assets");
const source = path.join(assets, "Ducky.png");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ducky-icons-"));

function resize(size, output) {
  execFileSync("sips", ["-z", String(size), String(size), source, "--out", output], {
    stdio: "pipe",
  });
}

try {
  // Modern ICNS stores PNG images in typed chunks (including Retina sizes).
  const chunks = [];
  for (const [type, size] of [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
    ["ic11", 32],
    ["ic12", 64],
    ["ic13", 256],
    ["ic14", 512],
  ]) {
    const output = path.join(temporary, `${type}.png`);
    resize(size, output);
    const png = fs.readFileSync(output);
    const chunk = Buffer.alloc(8);
    chunk.write(type);
    chunk.writeUInt32BE(8 + png.length, 4);
    chunks.push(chunk, png);
  }
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write("icns");
  icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  fs.writeFileSync(path.join(assets, "icon.icns"), Buffer.concat([icnsHeader, ...chunks]));
  resize(1024, path.join(assets, "icon.png"));
  // Menu bar assets have their own monochrome SVG source.
  execFileSync(process.execPath, [path.join(__dirname, "build-tray-icon.js")], {
    stdio: "inherit",
  });
  resize(1024, path.join(assets, "ducky.icon", "Assets", "ICON.png"));

  // ICO directory entries point to PNG payloads, supported by modern Windows.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const images = [];
  let offset = header.length;
  sizes.forEach((size, index) => {
    const output = path.join(temporary, `${size}.png`);
    resize(size, output);
    const png = fs.readFileSync(output);
    const entry = 6 + 16 * index;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    images.push(png);
    offset += png.length;
  });
  fs.writeFileSync(path.join(assets, "icon.ico"), Buffer.concat([header, ...images]));
  console.log("Generated Ducky PNG, macOS ICNS, Windows ICO, and catalog icons.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
