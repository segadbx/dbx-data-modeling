import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  title: string;
  description?: ReactNode;
  tone?: ToastTone;
  durationMs?: number;
}

interface ActiveToast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      const entry: ActiveToast = { id, tone: "info", durationMs: 4500, ...input };
      setToasts((prev) => [...prev, entry]);
      if (entry.durationMs && entry.durationMs > 0) {
        window.setTimeout(() => remove(id), entry.durationMs);
      }
    },
    [remove],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ActiveToast;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "info";
  const Icon = ICONS[tone];
  return (
    <div className={`toast toast-${tone}`} role="status">
      <span className={`toast-icon toast-icon-${tone}`} aria-hidden>
        <Icon size={18} />
      </span>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.description && <div className="toast-desc">{toast.description}</div>}
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X aria-hidden />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Allow useToast to be called outside provider without crashing — no-op
    return { toast: () => undefined };
  }
  return ctx;
}

// Tiny hook to surface a single async error as a toast for convenience.
export function useErrorToast(error: unknown) {
  const { toast } = useToast();
  useEffect(() => {
    if (!error) return;
    toast({
      tone: "danger",
      title: "Something went wrong",
      description: error instanceof Error ? error.message : String(error),
    });
  }, [error, toast]);
}
