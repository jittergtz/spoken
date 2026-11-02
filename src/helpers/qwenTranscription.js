const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const LlamaServerManager = require("./llamaServer");
const { getFFmpegPath, wavToFloat32Samples, computeFloat32RMS } = require("./ffmpegUtils");
const { getSafeTempDir } = require("./safeTempDir");
const { MODEL_ID } = require("./qwenModelInstaller");

const execFileAsync = promisify(execFile);
const cleanTranscript = (text) =>
  String(text || "")
    .replace(/^[\s\S]*?<asr_text>/, "")
    .trim();

class QwenTranscription {
  constructor(installer, server = new LlamaServerManager({ pidName: "qwen" })) {
    this.installer = installer;
    this.server = server;
    this.active = 0;
    this.queue = Promise.resolve();
  }

  transcribe(input, modelId = MODEL_ID) {
    this.active++;
    const job = this.queue.then(() => this.transcribeQueued(input, modelId));
    this.queue = job.catch(() => {});
    return job.finally(() => {
      this.active--;
    });
  }

  async transcribeQueued(input, modelId) {
    let dir;
    try {
      const config = this.installer.getModelConfig(modelId);
      const modelPath = this.installer.getModelPath(modelId);
      if (!(await this.installer.status(modelId)).installed)
        throw new Error("Qwen model is not installed. Download it in settings.");
      const audio = Buffer.from(input);
      if (!audio.length) throw new Error("Audio buffer is empty");
      const ffmpeg = getFFmpegPath();
      if (!ffmpeg) throw new Error("FFmpeg is required for Qwen transcription");
      dir = await fsp.mkdtemp(path.join(getSafeTempDir(), "qwen-asr-"));
      const source = path.join(dir, "input.audio");
      await fsp.writeFile(source, audio);
      await execFileAsync(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          source,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "pcm_s16le",
          "-f",
          "segment",
          "-segment_time",
          "25",
          "-reset_timestamps",
          "1",
          path.join(dir, "chunk-%05d.wav"),
        ],
        { windowsHide: true, timeout: 600000 }
      );
      const chunks = (await fsp.readdir(dir))
        .filter((name) => /^chunk-\d+\.wav$/.test(name))
        .sort();
      if (!chunks.length) return { success: false, message: "No audio detected" };
      await this.server.start(path.join(modelPath, config.files[0].name), {
        mmprojPath: path.join(modelPath, config.files[1].name),
      });
      const texts = [];
      for (const chunk of chunks) {
        const wav = await fsp.readFile(path.join(dir, chunk));
        if (computeFloat32RMS(wavToFloat32Samples(wav)) < 0.001) continue;
        const form = new FormData();
        form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
        form.append("response_format", "json");
        this.server.resetIdleTimer();
        const response = await fetch(
          `http://127.0.0.1:${this.server.port}/v1/audio/transcriptions`,
          { method: "POST", body: form, signal: AbortSignal.timeout(120000) }
        );
        if (!response.ok)
          throw new Error(`Qwen server returned HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json();
        const text = cleanTranscript(data.text);
        if (text) texts.push(text);
      }
      const text = texts.join(" ").trim();
      return text ? { success: true, text } : { success: false, message: "No audio detected" };
    } finally {
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async stop() {
    await this.server.stop();
  }
}

module.exports = { QwenTranscription, cleanTranscript };
