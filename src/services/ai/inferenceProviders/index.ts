import type { InferenceProvider } from "./types";
import { wrapCleanupTranscript } from "../../../config/prompts";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { groqProvider } from "./groq";
import { localProvider } from "./local";
import { enterpriseProvider } from "./enterprise";
import { spokenProvider } from "./spoken";
import { lanProvider } from "./lan";
import { openaiProvider } from "./openai";
import { tinfoilProvider } from "./tinfoil";
import { cortiProvider } from "./corti";

export const PROVIDER_REGISTRY: Readonly<Record<string, InferenceProvider>> = Object.freeze({
  "chatgpt-subscription": {
    id: "chatgpt-subscription",
    async call({ text, model, agentName, config, ctx }) {
      return window.electronAPI.chatgptSubscriptionGenerate({
        text: config.systemPrompt ? text : wrapCleanupTranscript(text),
        model,
        instructions: config.systemPrompt || ctx.getSystemPrompt(agentName),
      });
    },
  },
  openai: openaiProvider,
  custom: openaiProvider,
  openrouter: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  groq: groqProvider,
  tinfoil: tinfoilProvider,
  corti: cortiProvider,
  local: localProvider,
  bedrock: enterpriseProvider,
  azure: enterpriseProvider,
  vertex: enterpriseProvider,
  spoken: spokenProvider,
  openwhispr: spokenProvider,
  lan: lanProvider,
});

export type { InferenceProvider, ProviderContext, ProviderCallParams } from "./types";
