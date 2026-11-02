import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LocalModelCard } from "../ui/LocalModelCard";
import { ConfirmDialog } from "../ui/dialog";
import { useDialogs } from "../../hooks/useDialogs";
import type { QwenModelProgress } from "../../types/electron";
import type { ModelPickerStyles } from "../../utils/modelPickerStyles";

export default function QwenModelInstaller({
  modelId,
  name,
  size,
  styles,
  isSelected,
  onSelect,
}: {
  modelId: string;
  name: string;
  size: string;
  styles: ModelPickerStyles;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<QwenModelProgress | null>(null);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const installing = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const status = await window.electronAPI.qwenModelStatus(modelId);
      if (status.modelId !== modelId)
        throw new Error("Restart Spoken to load the updated Qwen installer");
      setAvailable(true);
      setInstalled(status.installed);
      setBusy(status.downloading || installing.current);
      setProgress(status.progress);
    } catch (err) {
      setAvailable(false);
      const detail = err instanceof Error ? err.message : String(err);
      setError(
        t("qwenInstaller.statusError", {
          defaultValue:
            "Could not connect to the Qwen installer. Restart Spoken and try again. ({{detail}})",
          detail,
        })
      );
    } finally {
      setLoading(false);
    }
  }, [t, modelId]);

  useEffect(() => {
    if (!window.electronAPI?.qwenModelStatus || !window.electronAPI?.onQwenModelFinished) {
      setLoading(false);
      return;
    }
    const unsubscribe = window.electronAPI.onQwenModelProgress((_event, value) => {
      if (value.modelId !== modelId) return;
      setBusy(true);
      setProgress(value);
    });
    const unsubscribeFinished = window.electronAPI.onQwenModelFinished((_event, result) => {
      if (result.modelId !== modelId) return;
      if (!result.success && result.code !== "DOWNLOAD_CANCELLED") {
        setError(result.error || "Download failed");
      }
      setCancelling(false);
      void refresh();
    });
    const cleared = () => {
      void refresh();
    };
    window.addEventListener("spoken-models-cleared", cleared);
    void refresh();
    return () => {
      unsubscribe();
      unsubscribeFinished();
      window.removeEventListener("spoken-models-cleared", cleared);
    };
  }, [refresh, modelId]);

  const install = async () => {
    setError("");
    setProgress(null);
    installing.current = true;
    setBusy(true);
    try {
      const result = await window.electronAPI.qwenModelInstall(modelId);
      if (!result.success && result.code !== "DOWNLOAD_CANCELLED")
        setError(result.error || "Download failed");
      if (result.success) onSelect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      installing.current = false;
      setCancelling(false);
      await refresh();
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      const result = await window.electronAPI.qwenModelCancel(modelId);
      if (!result.success) {
        setCancelling(false);
        setError(result.error || "Could not cancel download");
      }
    } catch (err) {
      setCancelling(false);
      setError(err instanceof Error ? err.message : "Could not cancel download");
    }
  };

  const remove = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await window.electronAPI.qwenModelRemove(modelId);
      if (!result.success) setError(result.error || "Could not remove model");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove model");
    } finally {
      await refresh();
    }
  };

  return (
    <div className="space-y-2">
      <LocalModelCard
        modelId={modelId}
        name={name}
        description="Local multilingual transcription"
        size={size}
        provider="qwen"
        isSelected={isSelected && installed}
        isDownloaded={installed}
        isDownloading={busy}
        isCancelling={cancelling}
        isInstalling={false}
        disabled={loading || !available}
        onSelect={onSelect}
        onDownload={() => void install()}
        onCancel={() => void cancel()}
        onDelete={() =>
          showConfirmDialog({
            title: t("transcription.deleteModel.title"),
            description: t("transcription.deleteModel.description"),
            variant: "destructive",
            onConfirm: () => void remove(),
          })
        }
        styles={styles}
      />
      {!window.electronAPI?.qwenModelStatus && (
        <p role="alert" className="text-xs text-destructive">
          {t("qwenInstaller.restartRequired", {
            defaultValue: "Restart Spoken to enable the Qwen installer.",
          })}
        </p>
      )}
      {window.electronAPI?.qwenModelStatus && !window.electronAPI?.transcribeLocalQwen && (
        <p role="alert" className="text-xs text-destructive">
          {t("qwenInstaller.restartTranscription", {
            defaultValue: "Restart Spoken to enable Qwen transcription.",
          })}
        </p>
      )}
      {busy && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {cancelling
              ? t("qwenInstaller.cancelling", { defaultValue: "Cancelling…" })
              : !progress
                ? t("qwenInstaller.starting", { defaultValue: "Starting download…" })
                : progress.phase === "verifying"
                  ? t("qwenInstaller.verifying", { defaultValue: "Verifying files" })
                  : t("qwenInstaller.downloading", { defaultValue: "Downloading" })}
            {progress &&
              ` · ${progress.percentage}% · ${(progress.downloadedBytes / 1e9).toFixed(2)} / ${(progress.totalBytes / 1e9).toFixed(2)} GB`}
          </p>
          <div
            role="progressbar"
            aria-label={t("qwenInstaller.downloadProgress", {
              defaultValue: "Model download progress",
            })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ? Math.min(100, Math.max(0, progress.percentage)) : undefined}
            className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className={`h-full rounded-full bg-gradient-to-r from-green-200 to-green-500 transition-[width] duration-300 ease-out ${!progress ? "w-1/3 animate-pulse" : ""}`}
              style={
                progress
                  ? { width: `${Math.min(100, Math.max(0, progress.percentage))}%` }
                  : undefined
              }
            />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
