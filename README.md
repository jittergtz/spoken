<p align="center">
  <img src="src/assets/icon.png" alt="Ducky" width="120" />
</p>

<h1 align="center">Ducky</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat" alt="Platform" />
</p>

<p align="center">
  Free, open-source voice-to-text dictation, meeting transcription, and notes for macOS, Windows, and Linux.
</p>

---

Ducky is a fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr). It is 100% free, with all features included: no account login, premium tier, or payments.

Ducky turns your voice into text, notes, and actions from your desktop. Press a hotkey, speak, and your words appear at your cursor. Choose between offline transcription with local speech-to-text engines like Whisper and NVIDIA Parakeet, or cloud processing.

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **Dictation translation** — dedicated hotkey to dictate in one language and paste the text in another
- **AI agent** — talk to GPT-5, Claude, Gemini, Groq, Tinfoil, OpenRouter, or local models with a named voice assistant
- **Voice agent hotkey** — dedicated hotkey that sends your dictation straight to your AI agent as a command, no wake word needed and no cleanup pass
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings, no cloud required
- **Notes** — create, organize, and search notes with folders, semantic search, cloud sync, and AI actions
- **Audio import** — transcribe existing audio and video: drag in files, batch-upload, or paste a YouTube/audio URL, with optional speaker detection
- **Local or cloud — your choice** — all core features (transcription, AI reasoning, speaker diarization, semantic search) work with local models or cloud providers — including GPU-accelerated local Whisper on Metal, CUDA, and Vulkan (AMD/Intel)
- **Public API & MCP** — manage notes and transcriptions programmatically or connect your AI assistant via the [MCP server](https://docs.openwhispr.com/integrations/mcp)

## Quick start

```bash
git clone https://github.com/jittergtz/spoken.git ducky
cd ducky
npm install
npm run dev
```

Requires Node.js 24+. See the [upstream documentation](https://docs.openwhispr.com/quickstart) for setup guides, platform-specific instructions, and build details.

## Documentation

The [upstream OpenWhispr documentation](https://docs.openwhispr.com) may help with setup and usage:

- [Getting started](https://docs.openwhispr.com/quickstart)
- [Platform guides](https://docs.openwhispr.com/platform/macos) (macOS, Windows, Linux)
- [API reference](https://docs.openwhispr.com/api/overview)
- [MCP server setup](https://docs.openwhispr.com/integrations/mcp)
- [Troubleshooting](https://docs.openwhispr.com/troubleshooting)

Repo examples:

- [Custom ASR shim](examples/custom-asr-shim/) for Self-Hosted transcription against non-OpenAI-compatible ASR APIs

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request. See the [upstream contributing guide](https://docs.openwhispr.com/contributing) for development setup and guidelines.

## License

[MIT](LICENSE) — free for personal and commercial use.

## Acknowledgments

- **[OpenWhispr](https://github.com/OpenWhispr/openwhispr)** — the project Ducky is forked from
- **[OpenAI Whisper](https://github.com/openai/whisper)** — speech recognition model powering local and cloud transcription
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — high-performance C++ implementation for local processing
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** — fast multilingual ASR model
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — cross-platform ONNX runtime for Parakeet inference
- **[Hugging Face](https://huggingface.co/)** — model hub hosting Whisper, Parakeet, and embedding model weights
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference for AI text processing
- **[Electron](https://www.electronjs.org/)** — cross-platform desktop framework
- **[React](https://react.dev/)** — UI component library
- **[shadcn/ui](https://ui.shadcn.com/)** — accessible components built on Radix primitives
