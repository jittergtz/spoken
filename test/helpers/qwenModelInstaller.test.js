const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return { app: { getPath: () => os.tmpdir() }, net: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { QwenModelInstaller } = require("../../src/helpers/qwenModelInstaller");
Module._load = originalLoad;

const content = [Buffer.from("model bytes"), Buffer.from("encoder bytes")];
const files = content.map((data, index) => ({
  name: `file-${index}.gguf`,
  size: data.length,
  sha256: crypto.createHash("sha256").update(data).digest("hex"),
}));

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-installer-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const installer = new QwenModelInstaller({
    root,
    files,
    checkDiskSpace: async () => ({ ok: true }),
    downloadFile: async (_url, destination, { onProgress }) => {
      const index = files.findIndex((file) => file.name === path.basename(destination));
      await fs.writeFile(destination, content[index]);
      onProgress(content[index].length, content[index].length);
    },
    ...options,
  });
  return { installer, root };
}

test("installs and verifies both files as a unit and removes them", async (t) => {
  const { installer } = await fixture(t);
  const progress = [];
  assert.equal((await installer.status()).installed, false);
  assert.equal((await installer.install((value) => progress.push(value))).success, true);
  assert.equal((await installer.status()).installed, true);
  assert.equal(progress.at(-1).percentage, 100);
  assert.ok(progress.some((item) => item.phase === "verifying"));
  await fs.truncate(path.join(installer.modelPath, files[1].name), 1);
  assert.equal((await installer.status()).installed, false);
  await installer.remove();
  assert.equal((await installer.status()).installed, false);
});

test("rejects corrupt files and removes staging data", async (t) => {
  const { installer } = await fixture(t, {
    downloadFile: async (_url, destination) =>
      fs.writeFile(destination, Buffer.alloc(files[0].size)),
  });
  await assert.rejects(installer.install(), /Checksum mismatch/);
  assert.equal((await installer.status()).installed, false);
  await assert.rejects(fs.stat(installer.stagingPath), { code: "ENOENT" });
});

test("cancels active download and prevents concurrent installation or deletion", async (t) => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const { installer } = await fixture(t, {
    downloadFile: async (_url, _destination, { signal }) => {
      started();
      await new Promise((resolve) => {
        signal.onAbort = resolve;
      });
      throw Object.assign(new Error("cancelled"), { isAbort: true });
    },
  });
  const pending = installer.install();
  await ready;
  await assert.rejects(installer.install(), { code: "DOWNLOAD_IN_PROGRESS" });
  assert.equal((await installer.remove()).success, false);
  assert.equal(installer.cancel().success, true);
  await assert.rejects(pending, { code: "DOWNLOAD_CANCELLED" });
  assert.equal((await installer.status()).installed, false);
  await assert.rejects(fs.stat(installer.stagingPath), { code: "ENOENT" });
});

test("keeps both model installations independent and rejects unknown IDs", async (t) => {
  const models = {
    "qwen3-asr-1.7b-q8": { repository: "test/large", revision: "large", files },
    "qwen3-asr-0.6b-q8": { repository: "test/small", revision: "small", files },
  };
  const { installer } = await fixture(t, { models });
  await installer.install("qwen3-asr-1.7b-q8");
  await installer.install("qwen3-asr-0.6b-q8");
  assert.equal((await installer.status("qwen3-asr-1.7b-q8")).installed, true);
  assert.equal((await installer.status("qwen3-asr-0.6b-q8")).installed, true);
  await installer.remove("qwen3-asr-0.6b-q8");
  assert.equal((await installer.status("qwen3-asr-1.7b-q8")).installed, true);
  assert.equal((await installer.status("qwen3-asr-0.6b-q8")).installed, false);
  await assert.rejects(installer.status("../outside"), /Unknown Qwen model/);
});
