import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../stores/settingsStore";
import {
  getTranscriptionProviders,
  WHISPER_MODEL_INFO,
  PARAKEET_MODEL_INFO,
} from "../models/ModelRegistry";
import qwenModels from "../models/qwenModels.json";
import { HotkeyInput } from "./ui/HotkeyInput";
import { parseHotkeyList, serializeHotkeyList } from "../utils/hotkeys";
import type { LocalTranscriptionProvider } from "../types/electron";

export type PillSettingsView = "speech" | "grammar";
type Option = { value: string; label: string; disabled?: boolean };
type GrammarSettings = Awaited<ReturnType<Window["electronAPI"]["getGrammarCorrectionSettings"]>>;

function QuickSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="pill-quick-select">
      <select
        className="pill-quick-field"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!options.some((option) => option.value === value) && (
          <option value={value}>{value || "—"}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </div>
  );
}

export default function PillQuickSettings({
  view,
  onClose,
}: {
  view: PillSettingsView;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [grammar, setGrammar] = useState<GrammarSettings>();
  const [grammarModels, setGrammarModels] = useState<Option[]>([]);
  const [localModels, setLocalModels] = useState<Record<string, Option[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backRef = useRef<HTMLButtonElement>(null);
  const api = window.electronAPI;

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    if (view === "grammar") {
      void Promise.all([api.getGrammarCorrectionSettings(), api.chatgptSubscriptionStatus()])
        .then(async ([saved, account]) => {
          if (!active) return;
          setGrammar(saved);
          if (saved.registrationError) setError(saved.registrationError);
          const models = account.connected ? await api.chatgptSubscriptionModels() : [];
          if (active) setGrammarModels(models);
        })
        .catch(() => {
          if (active) setError(t("grammarCorrection.loadFailed"));
        });
    } else {
      void (async () => {
        const results = await Promise.allSettled([
          api.listWhisperModels(),
          api.listParakeetModels(),
          Promise.all(
            Object.entries(qwenModels).map(async ([id, model]) => ({
              id,
              name: model.name,
              status: await api.qwenModelStatus(id),
            }))
          ),
        ]);
        if (!active) return;
        const [whisper, parakeet, qwen] = results;
        setLocalModels({
          whisper:
            whisper.status === "fulfilled" && whisper.value.success
              ? whisper.value.models
                  .filter((model) => model.downloaded)
                  .map((model) => ({
                    value: model.model,
                    label: WHISPER_MODEL_INFO[model.model]?.name || model.model,
                  }))
              : [],
          nvidia:
            parakeet.status === "fulfilled" && parakeet.value.success
              ? parakeet.value.models
                  .filter((model) => model.downloaded)
                  .map((model) => ({
                    value: model.model,
                    label: PARAKEET_MODEL_INFO[model.model]?.name || model.model,
                  }))
              : [],
          qwen:
            qwen.status === "fulfilled"
              ? qwen.value
                  .filter((model) => model.status.installed)
                  .map((model) => ({ value: model.id, label: model.name }))
              : [],
        });
        if (results.every((result) => result.status === "rejected"))
          setError(t("app.quickSettings.loadFailed"));
      })();
    }
    return () => {
      active = false;
    };
  }, [api, view, t]);

  async function save(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.quickSettings.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const isLocal = settings.transcriptionMode === "local" || settings.useLocalWhisper;
  const isHosted =
    !isLocal &&
    (settings.transcriptionMode === "spoken" || settings.transcriptionMode === "openwhispr");
  const isRemote = !isLocal && settings.transcriptionMode === "self-hosted";
  const currentProvider = isLocal
    ? `local:${settings.localTranscriptionProvider}`
    : isHosted
      ? "hosted"
      : isRemote
        ? "remote"
        : `cloud:${settings.cloudTranscriptionProvider}`;
  const cloudProviders = getTranscriptionProviders();
  const credentials: Record<string, boolean> = {
    openai: !!settings.openaiApiKey,
    groq: !!settings.groqApiKey,
    xai: !!settings.xaiApiKey,
    mistral: !!settings.mistralApiKey,
    corti: !!settings.cortiClientId && !!settings.cortiClientSecret,
    tinfoil: !!settings.tinfoilApiKey,
  };
  const providers: Option[] = [
    ...[
      { id: "whisper", name: "Whisper" },
      { id: "nvidia", name: "NVIDIA" },
      { id: "qwen", name: "QWEN" },
    ].map((provider) => ({
      value: `local:${provider.id}`,
      label: provider.name,
      disabled: !localModels[provider.id]?.length && currentProvider !== `local:${provider.id}`,
    })),
    ...cloudProviders
      .filter((provider) => credentials[provider.id] || currentProvider === `cloud:${provider.id}`)
      .map((provider) => ({ value: `cloud:${provider.id}`, label: provider.name })),
    ...(isHosted || settings.isSignedIn ? [{ value: "hosted", label: "Ducky" }] : []),
    ...(isRemote || settings.remoteTranscriptionUrl
      ? [{ value: "remote", label: t("app.quickSettings.selfHosted") }]
      : []),
  ];
  const modelValue = isLocal
    ? settings.localTranscriptionProvider === "qwen"
      ? settings.qwenModel
      : settings.localTranscriptionProvider === "nvidia"
        ? settings.parakeetModel
        : settings.whisperModel
    : isRemote
      ? settings.remoteTranscriptionModel
      : settings.cloudTranscriptionModel;
  const models: Option[] = isLocal
    ? [...(localModels[settings.localTranscriptionProvider] || [])]
    : isHosted || isRemote
      ? []
      : cloudProviders
          .find((provider) => provider.id === settings.cloudTranscriptionProvider)
          ?.models.map((model) => ({ value: model.id, label: model.name })) || [];
  if (modelValue && !models.some((model) => model.value === modelValue)) {
    const label = isLocal
      ? settings.localTranscriptionProvider === "qwen"
        ? qwenModels[modelValue]?.name
        : settings.localTranscriptionProvider === "nvidia"
          ? PARAKEET_MODEL_INFO[modelValue]?.name
          : WHISPER_MODEL_INFO[modelValue]?.name
      : modelValue;
    models.unshift({ value: modelValue, label: label || modelValue });
  }

  function updateLocalModel(value: string, provider = settings.localTranscriptionProvider) {
    if (provider === "qwen") settings.setQwenModel(value);
    else if (provider === "nvidia") settings.setParakeetModel(value);
    else settings.setWhisperModel(value);
  }

  function updateProvider(value: string) {
    const [mode, provider] = value.split(":");
    if (mode === "local") {
      const next = provider as LocalTranscriptionProvider;
      const available = localModels[next] || [];
      if (!available.length) return;
      settings.setLocalTranscriptionProvider(next);
      const saved =
        next === "qwen"
          ? settings.qwenModel
          : next === "nvidia"
            ? settings.parakeetModel
            : settings.whisperModel;
      updateLocalModel(
        available.some((model) => model.value === saved) ? saved : available[0].value,
        next
      );
      settings.setUseLocalWhisper(true);
      settings.setTranscriptionMode("local");
      settings.setCloudTranscriptionMode("byok");
    } else if (mode === "cloud") {
      const catalog = cloudProviders.find((entry) => entry.id === provider);
      if (!catalog?.models.length) return;
      settings.setCloudTranscriptionProvider(provider);
      settings.setCloudTranscriptionBaseUrl(catalog.baseUrl);
      settings.setCloudTranscriptionModel(catalog.models[0].id);
      settings.setCloudTranscriptionMode("byok");
      settings.setUseLocalWhisper(false);
      settings.setTranscriptionMode("providers");
    } else if (mode === "hosted" && (isHosted || settings.isSignedIn)) {
      settings.setUseLocalWhisper(false);
      settings.setCloudTranscriptionMode("spoken");
      settings.setTranscriptionMode("spoken");
    } else if (mode === "remote" && settings.remoteTranscriptionUrl) {
      settings.setUseLocalWhisper(false);
      settings.setCloudTranscriptionMode("byok");
      settings.setTranscriptionMode("self-hosted");
    }
  }

  const grammarOptions = [...grammarModels];
  if (grammar?.model && !grammarOptions.some((model) => model.value === grammar.model))
    grammarOptions.unshift({ value: grammar.model, label: grammar.model });
  const hotkeys = parseHotkeyList(settings.dictationKey);

  return (
    <section
      role="dialog"
      className="pill-quick-settings"
      aria-label={t(`app.quickSettings.${view}`)}
    >
      <header className="pill-quick-header">
        <button
          ref={backRef}
          type="button"
          className="pill-quick-back"
          aria-label={t("app.quickSettings.back")}
          onClick={onClose}
        >
          <ArrowLeft size={15} />
        </button>
        <h2>{t(`app.quickSettings.${view}`)}</h2>
      </header>
      <div className="pill-quick-body">
        {view === "speech" ? (
          <>
            <div className="pill-quick-columns">
              <label className="pill-quick-label">
                {t("app.quickSettings.provider")}
                <QuickSelect
                  label={t("app.quickSettings.provider")}
                  value={currentProvider}
                  options={providers}
                  onChange={updateProvider}
                />
              </label>
              <label className="pill-quick-label">
                {t("app.quickSettings.model")}
                <QuickSelect
                  label={t("app.quickSettings.model")}
                  value={modelValue}
                  options={models}
                  disabled={models.length < 2}
                  onChange={(value) =>
                    isLocal ? updateLocalModel(value) : settings.setCloudTranscriptionModel(value)
                  }
                />
              </label>
            </div>
            <div className="pill-quick-cleanup">
              <span id="pill-cleanup-label">{t("app.quickSettings.cleanup")}</span>
              <button
                type="button"
                className="pill-quick-switch"
                role="switch"
                aria-labelledby="pill-cleanup-label"
                aria-checked={settings.useCleanupModel}
                onClick={() => settings.setUseCleanupModel(!settings.useCleanupModel)}
              >
                <span />
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="pill-quick-label">
              {t("app.quickSettings.providerModel")}
              <div className="pill-quick-provider-model">
                <span>OpenAI</span>
                <QuickSelect
                  label={t("app.quickSettings.model")}
                  value={grammar?.model || ""}
                  options={grammarOptions}
                  disabled={busy || !grammar || !grammarModels.length}
                  onChange={(value) =>
                    void save(async () => {
                      const result = await api.setGrammarCorrectionModel(value);
                      if (!result.success)
                        throw new Error(result.message || t("app.quickSettings.saveFailed"));
                      setGrammar((current) => current && { ...current, model: value });
                    })
                  }
                />
              </div>
            </label>
            <div className="pill-quick-label" title={t("app.quickSettings.comingSoon")}>
              <span className="pill-quick-label-row">
                {t("app.quickSettings.toneHotkey")}
                <small>{t("app.quickSettings.comingSoon")}</small>
              </span>
              <div className="pill-quick-tone-row">
                <button type="button" className="pill-quick-field" disabled>
                  {t("app.quickSettings.notSet")}
                </button>
                <button type="button" className="pill-quick-field pill-quick-tone" disabled>
                  {t("app.quickSettings.casualWarm")}
                </button>
              </div>
            </div>
          </>
        )}
        <div className={`pill-quick-label ${view === "speech" ? "pill-quick-footer" : ""}`}>
          {t("app.quickSettings.hotkey")}
          <HotkeyInput
            variant="pill"
            value={view === "speech" ? hotkeys[0] || "" : grammar?.hotkey || ""}
            disabled={busy || (view === "grammar" && !grammar)}
            onChange={(value) =>
              void save(async () => {
                if (view === "grammar") {
                  const result = await api.setGrammarCorrectionHotkey(value);
                  if (!result.success)
                    throw new Error(result.message || t("app.quickSettings.saveFailed"));
                  setGrammar(
                    (current) => current && { ...current, hotkey: value, registrationError: "" }
                  );
                } else {
                  const next = serializeHotkeyList([value, ...hotkeys.slice(1)]);
                  const result = await api.updateHotkey(next);
                  if (!result.success)
                    throw new Error(result.message || t("app.quickSettings.saveFailed"));
                  settings.setDictationKey(next);
                }
              })
            }
          />
        </div>
        {error && (
          <p role="alert" className="pill-quick-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
