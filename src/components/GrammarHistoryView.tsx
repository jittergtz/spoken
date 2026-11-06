import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import type { GrammarHistoryItem } from "../types/electron";
import { useDialogs } from "../hooks/useDialogs";
import { useSettingsStore } from "../stores/settingsStore";
import { formatHotkeyLabel } from "../utils/hotkeys";
import grammarIcon from "../assets/icons/sidebar/grammar.png";
import HistoryList from "./HistoryList";
import TranscriptionItem from "./ui/TranscriptionItem";
import { ConfirmDialog } from "./ui/dialog";
import { useToast } from "./ui/useToast";

export default function GrammarHistoryView({ onCopy }: { onCopy: (text: string) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [items, setItems] = useState<GrammarHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hotkey, setHotkey] = useState("");
  const request = useRef(0);
  const retentionEnabled = useSettingsStore((s) => s.dataRetentionEnabled);
  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();

  useEffect(() => {
    let active = true;
    const load = async () => {
      const currentRequest = ++request.current;
      try {
        const history = await window.electronAPI.getGrammarHistory();
        if (!active || currentRequest !== request.current) return;
        setItems(history);
        setError(false);
      } catch {
        if (active && currentRequest === request.current) setError(true);
      } finally {
        if (active && currentRequest === request.current) setLoading(false);
      }
    };
    const dispose = window.electronAPI.onGrammarHistoryChanged(() => void load());
    void load();
    void window.electronAPI.getGrammarCorrectionSettings().then(
      (settings) => {
        if (active) setHotkey(settings.hotkey);
      },
      () => {}
    );
    return () => {
      active = false;
      dispose();
    };
  }, []);

  function remove(id?: number) {
    const clearAll = id === undefined;
    showConfirmDialog({
      title: t(clearAll ? "grammarHistory.clearTitle" : "grammarHistory.deleteTitle"),
      description: t(
        clearAll ? "grammarHistory.clearDescription" : "grammarHistory.deleteDescription"
      ),
      variant: "destructive",
      onConfirm: async () => {
        try {
          const result = clearAll
            ? await window.electronAPI.clearGrammarHistory()
            : await window.electronAPI.deleteGrammarHistoryItem(id);
          if (!result.success) throw new Error("History delete failed");
        } catch {
          toast({ title: t("grammarHistory.deleteFailed"), variant: "destructive" });
        }
      },
    });
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2.5 mb-4">
          <img src={grammarIcon} alt="" className="size-7" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">{t("sidebar.grammar")}</h1>
            <p className="text-xs text-muted-foreground">{t("grammarHistory.description")}</p>
          </div>
        </div>
        {!retentionEnabled && (
          <p className="mb-3 rounded-lg bg-card/50 px-3.5 py-2.5 text-xs text-muted-foreground">
            {t("grammarHistory.retentionDisabled")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive mb-3">
            {t("grammarHistory.loadFailed")}
          </p>
        )}
        {loading && items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card/50 dark:border-white/10 dark:bg-white/[0.08] flex items-center justify-center gap-2 py-8">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{t("controlPanel.loading")}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card/50 dark:border-white/10 dark:bg-white/[0.08] flex flex-col items-center justify-center py-16 px-4">
            <img src={grammarIcon} alt="" className="size-16 mb-5" />
            <h3 className="text-xs font-semibold text-foreground/70 dark:text-foreground/80 mb-2">
              {t("grammarHistory.empty")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("grammarHistory.emptyHint")}
              {hotkey && (
                <kbd className="ml-2 inline-flex items-center h-5 px-1.5 rounded-sm bg-surface-1 dark:bg-white/10 border border-border/50 font-mono">
                  {formatHotkeyLabel(hotkey)}
                </kbd>
              )}
            </p>
          </div>
        ) : (
          <HistoryList
            items={items}
            actions={
              <button
                onClick={() => remove()}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground/60 hover:!text-destructive hover:!bg-destructive/8 dark:hover:!bg-destructive/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 transition-all duration-200"
              >
                <Trash2 size={11} />
                {t("controlPanel.history.clearAll")}
              </button>
            }
            renderItem={(item) => (
              <TranscriptionItem
                item={item}
                grammarOutcome={item.outcome}
                onCopy={onCopy}
                onDelete={remove}
              />
            )}
          />
        )}
      </div>
      <ConfirmDialog {...confirmDialog} onOpenChange={hideConfirmDialog} />
    </div>
  );
}
