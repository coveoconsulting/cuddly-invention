import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./ui";
import { cn } from "../lib/utils";

type DialogContent = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
};

type DialogContextValue = {
  confirm: (input: DialogContent) => Promise<{ confirmed: boolean; reason: string }>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type DialogState = DialogContent & {
  open: boolean;
  resolve?: (value: { confirmed: boolean; reason: string }) => void;
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({ open: false, title: "" });
  const [reason, setReason] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  const confirm = useCallback(
    (input: DialogContent) =>
      new Promise<{ confirmed: boolean; reason: string }>((resolve) => {
        setReason("");
        setState({ ...input, open: true, resolve });
      }),
    [],
  );

  const close = useCallback(
    (confirmed: boolean) => {
      const r = reason.trim();
      state.resolve?.({ confirmed, reason: r });
      setState((current) => ({ ...current, open: false, resolve: undefined }));
    },
    [reason, state],
  );

  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "Enter" && !event.shiftKey && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    const focusTimeout = window.setTimeout(() => {
      if (state.requireReason && reasonRef.current) {
        reasonRef.current.focus();
      } else {
        confirmButtonRef.current?.focus();
      }
    }, 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimeout);
    };
  }, [state.open, state.requireReason, close]);

  const isDanger = state.tone === "danger";

  return (
    <DialogContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {state.open ? (
          <motion.div
            key="dialog-root"
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => close(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-[0_40px_120px_rgba(20,33,28,0.28)]"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <button
                type="button"
                onClick={() => close(false)}
                aria-label="Fermer"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-surface-container"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="p-6">
                <div className="flex items-start gap-3">
                  {isDanger ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-error-container text-error">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h2 id="dialog-title" className="text-lg font-bold text-on-surface">
                      {state.title}
                    </h2>
                    {state.description ? (
                      <div className="mt-1 text-sm text-secondary">{state.description}</div>
                    ) : null}
                  </div>
                </div>

                {state.requireReason ? (
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-secondary">
                      {state.reasonLabel ?? "Motif"}
                    </span>
                    <textarea
                      ref={reasonRef}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={state.reasonPlaceholder}
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => close(false)}>
                    {state.cancelLabel ?? "Annuler"}
                  </Button>
                  <Button
                    ref={confirmButtonRef}
                    onClick={() => close(true)}
                    className={cn(
                      isDanger && "bg-error text-on-error hover:bg-error/90 border-error/30",
                    )}
                  >
                    {state.confirmLabel ?? "Confirmer"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm must be used within DialogProvider");
  return ctx.confirm;
}
