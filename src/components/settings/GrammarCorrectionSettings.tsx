import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { HotkeyListInput } from "../ui/HotkeyListInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionHeader, SettingsPanel, SettingsPanelRow, SettingsRow } from "../ui/SettingsSection";

type Account = Awaited<ReturnType<Window["electronAPI"]["chatgptSubscriptionStatus"]>>;
type Models = Awaited<ReturnType<Window["electronAPI"]["chatgptSubscriptionModels"]>>;
type Settings = Awaited<ReturnType<Window["electronAPI"]["getGrammarCorrectionSettings"]>>;

export default function GrammarCorrectionSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings>();
  const [account, setAccount] = useState<Account>();
  const [models, setModels] = useState<Models>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const api = window.electronAPI;

  useEffect(() => {
    let active = true;
    void api.getGrammarCorrectionSettings().then(
      (value) => {
        if (active) setSettings(value);
      },
      () => {
        if (active) setError(t("grammarCorrection.loadFailed"));
      }
    );
    void (async () => {
      try {
        const status = await api.chatgptSubscriptionStatus();
        if (!active) return;
        setAccount(status);
        if (!status.connected) return;
        const catalog = await api.chatgptSubscriptionModels();
        if (active) setModels(catalog);
      } catch {
        if (active) setError(t("grammarCorrection.loadFailed"));
      }
    })();
    return () => {
      active = false;
    };
  }, [api, t]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("grammarCorrection.saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const updateHotkey = (hotkey: string) =>
    run(async () => {
      const result = await api.setGrammarCorrectionHotkey(hotkey);
      if (!result.success) throw new Error(result.message || t("grammarCorrection.saveFailed"));
      setSettings((current) => current && { ...current, hotkey, registrationError: "" });
    });

  const updateModel = (model: string) =>
    run(async () => {
      const result = await api.setGrammarCorrectionModel(model);
      if (!result.success) throw new Error(result.message || t("grammarCorrection.saveFailed"));
      setSettings((current) => current && { ...current, model });
    });

  const refreshAccount = () =>
    run(async () => {
      const current = await api.chatgptSubscriptionStatus();
      const status = current.connected ? current : await api.chatgptSubscriptionSignIn();
      setAccount(status);
      setModels([]);
      if (status.connected) setModels(await api.chatgptSubscriptionModels());
    });

  const selected = models.find((model) => model.value === settings?.model);

  return (
    <div className="space-y-3">
      <SectionHeader
        title={t("grammarCorrection.title")}
        description={t("grammarCorrection.description")}
      />
      <SettingsPanel>
        <SettingsPanelRow>
          <SettingsRow
            label={t("grammarCorrection.shortcut")}
            description={t("grammarCorrection.shortcutHint")}
          >
            <HotkeyListInput
              value={settings?.hotkey || ""}
              onChange={updateHotkey}
              onClear={() => updateHotkey("")}
              disabled={busy || !settings}
              maxHotkeys={1}
            />
          </SettingsRow>
        </SettingsPanelRow>
        <SettingsPanelRow>
          <SettingsRow
            label={t("grammarCorrection.account")}
            description={
              account?.connected
                ? t("grammarCorrection.connected", { email: account.email })
                : t("grammarCorrection.accountHint")
            }
          >
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={refreshAccount}>
                {t(account?.connected ? "grammarCorrection.refresh" : "grammarCorrection.signIn")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => api.openExternal("https://chatgpt.com/settings/usage")}
              >
                {t("grammarCorrection.manageUsage")}
              </Button>
            </div>
          </SettingsRow>
        </SettingsPanelRow>
        <SettingsPanelRow>
          <SettingsRow
            label={t("grammarCorrection.model")}
            description={t(
              settings?.model && models.length && !selected
                ? "grammarCorrection.modelUnavailable"
                : "grammarCorrection.modelHint"
            )}
          >
            <Select
              value={selected?.value || ""}
              onValueChange={updateModel}
              disabled={busy || !settings || !models.length}
            >
              <SelectTrigger className="min-w-44" aria-label={t("grammarCorrection.model")}>
                <SelectValue placeholder={t("grammarCorrection.selectModel")} />
              </SelectTrigger>
              <SelectContent>
                {models.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsPanelRow>
      </SettingsPanel>
      {(error || settings?.registrationError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || settings?.registrationError}
        </p>
      )}
    </div>
  );
}
