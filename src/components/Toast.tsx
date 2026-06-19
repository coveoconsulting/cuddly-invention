import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "info" | "warning";

type ToastInput = {
  title?: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastItem = ToastInput & {
  id: string;
  tone: ToastTone;
};

type ToastContextValue = {
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  error: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  info: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  warning: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

const STYLES: Record<ToastTone, string> = {
  success: "border-primary/40 bg-white text-on-surface [&_[data-icon]]:text-emerald-600",
  error: "border-error/40 bg-white text-on-surface [&_[data-icon]]:text-error",
  warning: "border-amber-400/40 bg-white text-on-surface [&_[data-icon]]:text-amber-600",
  info: "border-outline-variant bg-white text-on-surface [&_[data-icon]]:text-secondary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = (globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random()}`);
      const toast: ToastItem = {
        id,
        tone: input.tone ?? "info",
        title: input.title,
        message: input.message,
        duration: input.duration ?? 4200,
      };
      setToasts((current) => [...current, toast].slice(-5));
      const timer = window.setTimeout(() => dismiss(id), toast.duration);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const value: ToastContextValue = {
    show,
    dismiss,
    success: (message, opts) => show({ ...opts, message, tone: "success" }),
    error: (message, opts) => show({ ...opts, message, tone: "error" }),
    info: (message, opts) => show({ ...opts, message, tone: "info" }),
    warning: (message, opts) => show({ ...opts, message, tone: "warning" }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 32, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 48, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_24px_60px_rgba(20,33,28,0.18)] backdrop-blur-xl ${STYLES[toast.tone]}`}
              >
                <Icon data-icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  {toast.title ? (
                    <p className="text-sm font-bold leading-tight">{toast.title}</p>
                  ) : null}
                  <p className="text-xs leading-snug text-on-surface-variant">
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-surface-container"
                  aria-label="Fermer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
