import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import "./components/FloatingPill.css";
import { AudioLines, Eye, Pencil, X } from "lucide-react";
import { useToast } from "./components/ui/useToast";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSettingsStore } from "./stores/settingsStore";
import PillQuickSettings from "./components/PillQuickSettings";
const VoiceWaveIndicator = ({ level }) => (
  <div className="flex h-5 items-center justify-center gap-0.5" aria-hidden="true">
    {[0.5, 0.8, 1, 0.7, 0.9, 0.55].map((weight, i) => (
      <span
        key={i}
        style={{
          width: 2,
          height: 2 + level * 12 * weight,
          borderRadius: 999,
          backgroundColor: "white",
          transition: "height 100ms ease-out",
        }}
      />
    ))}
  </div>
);

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [quickSettings, setQuickSettings] = useState(null);
  const isQuickSettingsOpen = Boolean(quickSettings);
  const commandMenuRef = useRef(null);
  const buttonRef = useRef(null);
  const hoverExitTimeoutRef = useRef(null);
  const pillRef = useRef(null);
  const canvasSizeRef = useRef("BASE");
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { isDragging, handleMouseDown, handleMouseUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const panelStartPosition = useSettingsStore((s) => s.panelStartPosition);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => {
      clearTimeout(hoverExitTimeoutRef.current);
      setWindowInteractivity(false);
    };
  }, [setWindowInteractivity]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: t("app.toasts.hotkeyChanged.description", {
          original: data.original,
          fallback: data.fallback,
        }),
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const showGpuFallbackToast = () => {
      toast({
        title: t("app.toasts.gpuFallback.title"),
        description: t("app.toasts.gpuFallback.description"),
        duration: 10000,
      });
    };
    const unsubscribeCudaFallback =
      window.electronAPI?.onCudaFallbackNotification?.(showGpuFallbackToast);
    const unsubscribeGpuFallback =
      window.electronAPI?.onGpuFallbackNotification?.(showGpuFallbackToast);

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `\u201c${w}\u201d`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                  // silently fail — word stays in dictionary
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-neutral-100/90 hover:text-white
                bg-neutral-500/15 hover:bg-neutral-500/25
                border border-neutral-400/20 hover:border-neutral-400/35
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeCudaFallback?.();
      unsubscribeGpuFallback?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isCommandMenuOpen || quickSettings || toastCount > 0) {
      setWindowInteractivity(true);
    } else {
      setWindowInteractivity(isHovered);
    }
  }, [isCommandMenuOpen, quickSettings, isHovered, toastCount, setWindowInteractivity]);

  useEffect(() => {
    window.electronAPI?.setMainWindowFocusable?.(isQuickSettingsOpen);
    return () => {
      if (isQuickSettingsOpen) window.electronAPI?.setMainWindowFocusable?.(false);
    };
  }, [isQuickSettingsOpen]);

  useEffect(() => {
    if (!quickSettings) return;
    const closeOutside = (event) => {
      if (!pillRef.current?.contains(event.target)) setQuickSettings(null);
    };
    const closeOnBlur = () => setQuickSettings(null);
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [quickSettings]);

  useLayoutEffect(() => {
    // Expand the native canvas too: CSS cannot draw outside an Electron window.
    // WITH_MENU is also understood by an already-running main process after HMR.
    const sizeKey =
      quickSettings || (isCommandMenuOpen && toastCount > 0)
        ? "EXPANDED"
        : isCommandMenuOpen || isHovered
          ? "WITH_MENU"
          : toastCount > 0
            ? "WITH_TOAST"
            : "BASE";

    const sizes = { BASE: 0, WITH_MENU: 1, WITH_TOAST: 2, EXPANDED: 2 };
    const resize = () => {
      canvasSizeRef.current = sizeKey;
      window.electronAPI?.resizeMainWindow?.(sizeKey);
    };

    if (sizes[sizeKey] < sizes[canvasSizeRef.current]) {
      // Keep the larger canvas until the 380 ms pill collapse has finished.
      const timeout = setTimeout(() => {
        resize();
      }, 420);
      return () => clearTimeout(timeout);
    }

    resize();
  }, [isCommandMenuOpen, quickSettings, isHovered, toastCount]);

  const handleDictationToggle = React.useCallback(() => {
    setQuickSettings(null);
    setIsCommandMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const {
    isRecording,
    isProcessing,
    micCaptureStatus,
    audioLevel,
    toggleListening,
    cancelRecording,
    cancelProcessing,
  } = useAudioRecording(toast, {
    onToggle: handleDictationToggle,
    monitorAudioLevel: true,
  });

  // Sync auto-hide from main process — setState directly to avoid IPC echo
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  const isRecordingRef = useRef(isRecording);

  useLayoutEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCancelHotkeyPressed?.(() => {
      if (isRecordingRef.current) cancelRecording();
    });
    return () => unsubscribe?.();
  }, [cancelRecording]);

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      // Delay briefly so processing can start after recording stops without a flash
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsCommandMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCommandMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        if (quickSettings) {
          setQuickSettings(null);
        } else if (isCommandMenuOpen) {
          setIsCommandMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isCommandMenuOpen, quickSettings]);

  // Determine current mic state
  const getMicState = () => {
    if (isRecording && (micCaptureStatus === "reconnecting" || micCaptureStatus === "unavailable"))
      return "unavailable";
    if (isRecording) return "recording";
    if (isProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing) return "hover";
    return "idle";
  };

  const micState = getMicState();

  const isExpanded =
    !isRecording && !isProcessing && (isHovered || isCommandMenuOpen || Boolean(quickSettings));
  const isPillHidden = floatingIconAutoHide && !isRecording && !isProcessing;
  const micLabel =
    micState === "unavailable"
      ? t("app.mic.waitingForMicrophone")
      : isRecording
        ? t("app.mic.recording")
        : isProcessing
          ? t("app.mic.processing")
          : t("app.quickSettings.speech");

  const enterPill = () => {
    clearTimeout(hoverExitTimeoutRef.current);
    setIsHovered(true);
    setWindowInteractivity(true);
  };

  const leavePill = () => {
    clearTimeout(hoverExitTimeoutRef.current);
    hoverExitTimeoutRef.current = setTimeout(() => {
      if (pillRef.current?.contains(document.activeElement)) return;
      setIsHovered(false);
    }, 500);
  };

  return (
    <div className="dictation-window ">
      {/* Voice button - position determined by panelStartPosition setting */}
      <div
        className={`fixed bottom-1  z-50 ${
          panelStartPosition === "bottom-left"
            ? "left-1"
            : panelStartPosition === "center"
              ? "left-1/2 -translate-x-1/2"
              : "right-1"
        }`}
      >
        <div
          ref={pillRef}
          className={`relative flex items-center ${isPillHidden ? "invisible" : ""}`}
          onMouseEnter={enterPill}
          onMouseLeave={leavePill}
          onFocusCapture={enterPill}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) leavePill();
          }}
        >
          {(isRecording || isProcessing) && isHovered && (
            <button
              aria-label={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              onClick={(e) => {
                e.stopPropagation();
                isRecording ? cancelRecording() : cancelProcessing();
              }}
              className={`absolute ${panelStartPosition === "bottom-left" ? "left-full ml-2" : "right-full mr-2"} group/cancel w-5 h-5 rounded-full bg-surface-2/90 hover:bg-destructive border border-border hover:border-destructive/70 flex items-center justify-center transition-colors duration-150 shadow-sm backdrop-blur-sm`}
            >
              <X
                size={10}
                strokeWidth={2.5}
                className="text-foreground group-hover/cancel:text-destructive-foreground transition-colors duration-150"
              />
            </button>
          )}
          <div
            className="floating-pill"
            data-state={micState}
            data-expanded={isExpanded}
            data-panel={Boolean(quickSettings)}
            data-dragging={isDragging}
          >
            <button
              type="button"
              className="floating-pill-action floating-pill-action-left"
              onMouseDown={(event) => event.preventDefault()}
              aria-label={t("app.buttons.pencil")}
              title={t("app.buttons.pencil")}
              aria-haspopup="dialog"
              aria-expanded={quickSettings === "grammar"}
              disabled={!isExpanded}
              tabIndex={isExpanded && !quickSettings ? 0 : -1}
              onClick={() => {
                setIsCommandMenuOpen(false);
                setQuickSettings("grammar");
              }}
            >
              <Pencil size={20} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <button
              type="button"
              ref={buttonRef}
              aria-label={micLabel}
              aria-haspopup={!isRecording ? "dialog" : undefined}
              aria-expanded={quickSettings === "speech"}
              title={isExpanded ? micLabel : undefined}
              disabled={isProcessing}
              tabIndex={quickSettings ? -1 : 0}
              onMouseDown={(e) => {
                setIsCommandMenuOpen(false);
                setDragStartPos({ x: e.clientX, y: e.clientY });
                setHasDragged(false);
                handleMouseDown(e);
              }}
              onMouseMove={(e) => {
                if (dragStartPos && !hasDragged) {
                  const distance = Math.sqrt(
                    Math.pow(e.clientX - dragStartPos.x, 2) +
                      Math.pow(e.clientY - dragStartPos.y, 2)
                  );
                  if (distance > 5) {
                    // 5px threshold for drag
                    setHasDragged(true);
                  }
                }
              }}
              onMouseUp={(e) => {
                handleMouseUp(e);
                setDragStartPos(null);
              }}
              onClick={(e) => {
                if (!hasDragged) {
                  setIsCommandMenuOpen(false);
                  if (isRecording) toggleListening();
                  else setQuickSettings("speech");
                }
                e.preventDefault();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!hasDragged) {
                  setWindowInteractivity(true);
                  setIsCommandMenuOpen((prev) => !prev);
                }
              }}
              className="floating-pill-mic"
            >
              <span className="floating-pill-idle-icon" aria-hidden="true">
                <AudioLines size={22} strokeWidth={1.8} />
              </span>
              {micState === "recording" ? (
                <VoiceWaveIndicator level={audioLevel} />
              ) : micState === "unavailable" ? (
                <span className="text-white text-base font-bold">!</span>
              ) : null}
              {micState === "unavailable" && (
                <div className="absolute inset-0 rounded-full border-2 border-neutral-200/70 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              className="floating-pill-action floating-pill-action-right"
              onMouseDown={(event) => event.preventDefault()}
              aria-label={t("app.buttons.eye")}
              title={t("app.buttons.eye")}
              tabIndex={isExpanded && !quickSettings ? 0 : -1}
              disabled={!isExpanded}
            >
              <Eye size={20} strokeWidth={1.7} aria-hidden="true" />
            </button>
            {quickSettings && (
              <PillQuickSettings
                key={quickSettings}
                view={quickSettings}
                onClose={() => {
                  setQuickSettings(null);
                  setIsHovered(true);
                }}
              />
            )}
          </div>
          {isCommandMenuOpen && (
            <div
              ref={commandMenuRef}
              className="absolute bottom-full right-0 mb-3 w-48 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-sm"
              onMouseEnter={() => {
                setWindowInteractivity(true);
              }}
              onMouseLeave={() => {
                if (!isHovered) {
                  setWindowInteractivity(false);
                }
              }}
            >
              <button
                className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  toggleListening();
                }}
              >
                {isRecording
                  ? t("app.commandMenu.stopListening")
                  : t("app.commandMenu.startListening")}
              </button>
              <div className="h-px bg-border" />
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  setIsCommandMenuOpen(false);
                  setWindowInteractivity(false);
                  handleClose();
                }}
              >
                {t("app.commandMenu.hideForNow")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
