const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron")
    return { app: { isReady: () => false, getPath: () => os.tmpdir() }, net: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { QwenTranscription, cleanTranscript } = require("../../src/helpers/qwenTranscription");
Module._load = originalLoad;

function wav(seconds) {
  const dataSize = 16000 * 2 * seconds;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let offset = 44; offset < buffer.length; offset += 2) buffer.writeInt16LE(1200, offset);
  return buffer;
}

test("removes Qwen language metadata", () => {
  assert.equal(cleanTranscript("language English<asr_text> Hello there. "), "Hello there.");
  assert.equal(cleanTranscript("Plain text"), "Plain text");
});

test("splits long audio, sends every part to the local server and joins results", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8221/v1/audio/transcriptions");
    assert.equal(options.body.get("file").type, "audio/wav");
    return { ok: true, json: async () => ({ text: `language English<asr_text>part ${++calls}` }) };
  };
  const server = {
    port: 8221,
    start: async (_model, options) => assert.ok(options.mmprojPath),
    resetIdleTimer() {},
  };
  const installer = {
    getModelPath: () => os.tmpdir(),
    getModelConfig: () => ({ files: [{ name: "model" }, { name: "encoder" }] }),
    status: async () => ({ installed: true }),
  };
  const result = await new QwenTranscription(installer, server).transcribe(wav(26));
  assert.equal(calls, 2);
  assert.deepEqual(result, { success: true, text: "part 1 part 2" });
});

test("rejects transcription when model is missing", async () => {
  const installer = {
    getModelPath: () => os.tmpdir(),
    getModelConfig: () => ({ files: [] }),
    status: async () => ({ installed: false }),
  };
  await assert.rejects(new QwenTranscription(installer, {}).transcribe(wav(1)), /not installed/);
});

test("serializes requests using different models so one cannot replace the other", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const events = [];
  const server = {
    port: 8221,
    async start(model) {
      events.push(`start:${model}`);
    },
    resetIdleTimer() {},
  };
  const installer = {
    getModelPath: (modelId) => `/models/${modelId}`,
    getModelConfig: () => ({ files: [{ name: "model" }, { name: "encoder" }] }),
    status: async () => ({ installed: true }),
  };
  global.fetch = async () => {
    events.push("request");
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true, json: async () => ({ text: "hello" }) };
  };
  const service = new QwenTranscription(installer, server);
  await Promise.all([service.transcribe(wav(1), "large"), service.transcribe(wav(1), "small")]);
  assert.deepEqual(events, [
    "start:/models/large/model",
    "request",
    "start:/models/small/model",
    "request",
  ]);
});
