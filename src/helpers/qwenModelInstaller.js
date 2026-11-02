const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { downloadFile, createDownloadSignal, checkDiskSpace } = require("./downloadUtils");
const { getModelsDirForService } = require("./modelDirUtils");

const MODELS = require("../models/qwenModels.json");
const MODEL_ID = "qwen3-asr-1.7b-q8";
const FILES = MODELS[MODEL_ID].files;
const cancelled = () =>
  Object.assign(new Error("Download cancelled"), { code: "DOWNLOAD_CANCELLED" });

class QwenModelInstaller {
  constructor(options = {}) {
    this.root = options.root || getModelsDirForService("qwen");
    this.models = options.models || MODELS;
    this.files = options.files || this.models[MODEL_ID].files;
    this.downloadFile = options.downloadFile || downloadFile;
    this.checkDiskSpace = options.checkDiskSpace || checkDiskSpace;
    this.active = null;
  }

  get modelPath() {
    return this.getModelPath(MODEL_ID);
  }
  get stagingPath() {
    return path.join(this.root, `${MODEL_ID}.staging`);
  }

  getModelConfig(modelId = MODEL_ID) {
    if (!Object.hasOwn(this.models, modelId)) throw new Error(`Unknown Qwen model: ${modelId}`);
    const config = this.models[modelId];
    return { ...config, files: modelId === MODEL_ID ? this.files : config.files };
  }

  getModelPath(modelId = MODEL_ID) {
    this.getModelConfig(modelId);
    return path.join(this.root, modelId);
  }

  async status(modelId = MODEL_ID) {
    const config = this.getModelConfig(modelId);
    const modelPath = this.getModelPath(modelId);
    let installed = false;
    try {
      const marker = JSON.parse(await fsp.readFile(path.join(modelPath, "verified.json"), "utf8"));
      installed = marker.revision === config.revision;
      for (const file of config.files) {
        if ((await fsp.stat(path.join(modelPath, file.name))).size !== file.size) installed = false;
      }
    } catch {
      installed = false;
    }
    return {
      success: true,
      modelId,
      installed,
      downloading: this.active?.modelId === modelId,
      progress: this.active?.modelId === modelId ? this.active.progress : null,
    };
  }

  async install(modelId = MODEL_ID, onProgress = () => {}) {
    if (typeof modelId === "function") {
      onProgress = modelId;
      modelId = MODEL_ID;
    }
    const config = this.getModelConfig(modelId);
    const modelPath = this.getModelPath(modelId);
    const stagingPath = `${modelPath}.staging`;
    if (this.active)
      throw Object.assign(new Error("A Qwen download is already in progress"), {
        code: "DOWNLOAD_IN_PROGRESS",
      });
    const { signal, abort } = createDownloadSignal();
    const active = { signal, abort, progress: null, modelId };
    active.done = new Promise((resolve) => {
      active.resolveDone = resolve;
    });
    this.active = active;
    const total = config.files.reduce((sum, file) => sum + file.size, 0);
    const report = (phase, bytes) => {
      active.progress = {
        modelId,
        phase,
        downloadedBytes: bytes,
        totalBytes: total,
        percentage: Math.min(100, Math.floor((bytes * 100) / total)),
      };
      onProgress(active.progress);
    };
    const checkCancelled = () => {
      if (signal.aborted) throw cancelled();
    };
    try {
      if ((await this.status(modelId)).installed)
        return { success: true, installed: true, modelId };
      await fsp.mkdir(this.root, { recursive: true });
      const space = await this.checkDiskSpace(this.root, total);
      if (!space.ok)
        throw new Error(
          `Not enough disk space. Qwen requires approximately ${Math.ceil((total / 1e9) * 10) / 10} GB.`
        );
      await fsp.rm(stagingPath, { recursive: true, force: true });
      await fsp.mkdir(stagingPath, { recursive: true });
      let completed = 0;
      report("downloading", 0);
      for (const file of config.files) {
        checkCancelled();
        const destination = path.join(stagingPath, file.name);
        await this.downloadFile(
          `https://huggingface.co/${config.repository}/resolve/${config.revision}/${file.name}`,
          destination,
          {
            signal,
            expectedSize: file.size,
            onProgress: (bytes) => report("downloading", completed + Math.min(bytes, file.size)),
          }
        );
        checkCancelled();
        report("verifying", completed + file.size);
        const stat = await fsp.stat(destination);
        if (stat.size !== file.size) throw new Error(`Incomplete download: ${file.name}`);
        const hash = crypto.createHash("sha256");
        for await (const chunk of fs.createReadStream(destination)) {
          checkCancelled();
          hash.update(chunk);
        }
        if (hash.digest("hex") !== file.sha256) throw new Error(`Checksum mismatch: ${file.name}`);
        completed += file.size;
      }
      checkCancelled();
      await fsp.writeFile(
        path.join(stagingPath, "verified.json"),
        JSON.stringify({ revision: config.revision })
      );
      checkCancelled();
      active.committing = true;
      await fsp.rm(modelPath, { recursive: true, force: true });
      await fsp.rename(stagingPath, modelPath);
      return { success: true, installed: true, modelId };
    } catch (error) {
      if (error.isAbort || signal.aborted) throw cancelled();
      throw error;
    } finally {
      await fsp.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
      if (this.active === active) this.active = null;
      active.resolveDone();
    }
  }

  cancel(modelId = MODEL_ID) {
    this.getModelConfig(modelId);
    if (this.active && this.active.modelId !== modelId)
      return { success: false, error: "A different model is downloading" };
    if (!this.active) return { success: false, error: "No download in progress" };
    if (this.active.committing) return { success: false, error: "Installation is finishing" };
    this.active.abort();
    return { success: true };
  }

  async remove(modelId = MODEL_ID) {
    const modelPath = this.getModelPath(modelId);
    if (this.active?.modelId === modelId)
      return { success: false, error: "Cancel the active download before removing the model" };
    await fsp.rm(modelPath, { recursive: true, force: true });
    await fsp.rm(`${modelPath}.staging`, { recursive: true, force: true });
    return { success: true };
  }

  async cancelAndRemove() {
    const active = this.active;
    if (active) {
      if (!active.committing) active.abort();
      await active.done;
    }
    for (const modelId of Object.keys(this.models)) await this.remove(modelId);
    return { success: true };
  }
}

module.exports = { QwenModelInstaller, MODEL_ID, FILES, MODELS };
