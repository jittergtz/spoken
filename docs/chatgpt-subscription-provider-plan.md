# ChatGPT subscription provider implementation plan

## Goal

Let Ducky users connect an eligible ChatGPT subscription and use it for text cleanup, punctuation, grammar, dictionary-aware spelling corrections, translation, and note formatting. Users choose **ChatGPT subscription** in Ducky and authorize plan usage in their browser. Requests use their existing plan allowance or available credits according to their ChatGPT settings.

Ducky continues to transcribe audio with its configured speech-to-text provider. The current subscription-sharing preview supports text requests, but not audio input or the transcription API. “Pronunciation” in this first version means correcting likely transcription spellings using the user's dictionary and context. Evaluating how someone pronounced a word requires audio and needs a separate future solution. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

## Proposed approach

Use OpenAI's **Sign in with ChatGPT** plan-usage flow and the public Responses API. This is documented for open-source, locally hosted applications and does not require the user to install Codex or configure an API key. Availability depends on the account, workspace, region, and OpenAI's preview rules. Confirm access with a real account before treating the integration as ready. [Overview](https://developers.openai.com/siwc/token-sharing-open-source) · [Quickstart](https://developers.openai.com/siwc/quickstart)

OpenAI's example DevKit has a noncommercial license. Ducky is MIT-licensed, so review compatibility and distribution rights before copying or bundling that code. An independently implemented integration of the documented protocol may be appropriate after that review. [DevKit license](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/LICENSE)

## 1. Verify the end-to-end flow

- [ ] Confirm the current OpenAI documentation, preview requirements, and Ducky's intended distribution qualify for this flow.
- [ ] Use a local development-only prototype to complete sign-in, obtain plan-use consent, list models, and complete a short text request with a consenting eligible account.
- [ ] Record observed account eligibility, model availability, latency, usage behavior, and errors. Do not log tokens or transcript contents.
- [ ] Confirm the license decision for any third-party dependencies or sample code before shipping them.

**Done when:** a real request completes using the user's plan and the approach is suitable for Ducky's distribution.

## 2. Add account connection in the Electron main process

- [ ] Create a main-process service to own registration, authentication, token refresh, model discovery, and inference. Generate and persist one stable opaque host ID per installation.
- [ ] Follow OpenAI's dynamic client registration and system-browser OAuth flow with PKCE, state, nonce, and a loopback callback. Validate the callback and ID token, save the issued client ID, and verify the `chatgpt.tokens.use.direct` permission before enabling inference.
- [ ] Store access, refresh, and retained identity tokens in OS-protected storage. Keep credentials out of renderer state, localStorage, logs, URLs, and diagnostics. Handle unavailable secure storage explicitly.
- [ ] Serialize refreshes for each account, persist rotated tokens atomically, and handle expiration, revocation, reconnect, and sign-out. Follow OpenAI's session revocation guidance.
- [ ] Expose narrow, validated IPC operations through `preload.js` and `src/types/electron.ts`. Return connection state and account display information, never credentials.

**Done when:** a user can connect, restart Ducky, reconnect when necessary, and disconnect without exposing credentials to the renderer. [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) · [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)

## 3. Implement subscription-backed inference

- [ ] List models with the authorized account and show only models marked visible. Refresh the catalog when the account changes and store the selected model's slug.
- [ ] Call `POST https://api.openai.com/v1/responses` from the main process using the OAuth access token. Set `store: false` and `stream: true` and provide an input array with the context required for the request.
- [ ] Translate Ducky's cleanup prompt into `instructions` or developer input. Strip unsupported fields including `temperature` and `max_output_tokens`; do not pass an explicit system-role message. Check the current preview documentation for the complete list.
- [ ] Consume server-sent events through `response.completed`. Treat failed, incomplete, interrupted, and empty responses as failures, even if text was streamed earlier. Support cancellation and bounded timeouts.
- [ ] Map eligibility, permission, rate-limit, temporary service, and unsupported-capability errors to actionable messages. Link usage-limit errors to ChatGPT usage settings and avoid silent billing changes or repeated retries of invalid requests.

**Done when:** a completed correction reaches Ducky reliably, and failures never replace a transcript with partial or empty output. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) · [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)

## 4. Connect Ducky's provider and cleanup pipeline

- [ ] Add a distinct subscription provider ID in `src/models/ModelRegistry.ts`, settings types and persistence, and `src/services/ai/inferenceProviders/index.ts`. Preserve existing OpenAI API-key users and saved settings.
- [ ] Implement a provider adapter using the existing `InferenceProvider` interface. Route calls through the main-process IPC service, using the enterprise provider as a reference for the process boundary.
- [ ] Pass the existing cleanup instructions, preferred language, and user dictionary through the normal cleanup path. Treat dictated text as content to transform, preserve meaning, and respect the user's configured prompt.
- [ ] Verify both Tap and Hold dictation paths, custom prompts, and dictionary terms. On failure retain the original transcription and use Ducky's existing cleanup-failure feedback.
- [ ] Route supported note formatting and translation through their existing text workflows. Inspect each entry point before claiming support: cleanup, agent streaming, and note actions may use different paths in `src/services/ReasoningService.ts`.
- [ ] Add streaming or tool support only where a feature needs it and the subscription route supports it. Keep unsupported agent capabilities unavailable with a clear explanation.

**Done when:** selecting the subscription provider works from actual dictation and supported note actions, including after restarting the app.

## 5. Build the settings experience

- [ ] Add **ChatGPT subscription** beside existing language model providers. Offer **Continue with ChatGPT**, connection status, account identity, disconnect, and model selection.
- [ ] Explain that requests use the user's ChatGPT plan or available credits and show a **Manage usage** link to `https://chatgpt.com/settings/usage`.
- [ ] Distinguish sign-in from permission to use plan credits. Show useful states for signing in, permission denied, unavailable account, expired connection, unavailable models, and usage limits.
- [ ] Explain that Ducky sends transcript text to OpenAI when this provider is selected. Add translations through the project's existing locale workflow.

**Done when:** a user can understand and manage the connection without entering an API key. [OpenAI UI guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)

## 6. Verify and release

- [ ] Add targeted tests for OAuth validation, token refresh and rotation, IPC boundaries, SSE completion and errors, request field filtering, and preserving the original transcript on failure. Mock network responses and use synthetic data.
- [ ] Test real sign-in and inference with an eligible account, including a declined consent, expired session, interrupted request, and usage-limit response where practical.
- [ ] Test grammar, punctuation, names and dictionary terms, multilingual dictation, long transcripts, and meeting note summaries. Compare output quality and measure time from transcription to pasted result.
- [ ] Check secure storage, browser callback, reconnect, and packaging on macOS, Windows, and Linux. Verify existing API-key and local providers still work.
- [ ] Run the relevant automated tests, typecheck, lint, and renderer build. Document setup, plan limits, supported features, data handling, and troubleshooting before release.

## Decisions to confirm during implementation

1. Whether first release covers only cleanup or also translation and note formatting once their entry points are verified.
2. Whether to support multiple ChatGPT accounts initially or start with one account and a safe reconnect flow.
3. Whether pronunciation means dictionary-based correction, spoken pronunciation feedback, or audio generation. The latter two need separately supported audio capabilities.
4. Whether Ducky's distribution and any chosen implementation dependencies satisfy their applicable license and provider terms.
