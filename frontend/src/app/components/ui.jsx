import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";

/* ── Toasts ─────────────────────────────────────────────────────────────── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_TONE = {
  success: { cls: "border-mint-600/40", icon: CheckCircle2, iconCls: "text-mint-600" },
  error: { cls: "border-danger/40", icon: AlertCircle, iconCls: "text-danger" },
  info: { cls: "border-line-strong", icon: Info, iconCls: "text-accent" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[90] bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 flex flex-col gap-2 items-stretch sm:items-end pointer-events-none"
        role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const tone = TOAST_TONE[t.type] || TOAST_TONE.info;
            const Icon = tone.icon;
            return (
              <motion.div key={t.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl border bg-surface text-fg text-sm shadow-[var(--shadow-pop)] sm:max-w-sm ${tone.cls}`}>
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.iconCls}`} aria-hidden />
                <span>{t.text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ── Surfaces ───────────────────────────────────────────────────────────── */
export function Card({ className = "", children, as: Tag = "div", ...props }) {
  return (
    <Tag {...props} className={`bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </Tag>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────────── */
const VARIANTS = {
  primary: "bg-mint-600 text-on-primary font-semibold hover:bg-mint-500 active:bg-mint-700 active:text-white shadow-sm",
  secondary: "bg-surface border border-line-strong text-fg font-semibold hover:bg-surface-2",
  ghost: "text-muted hover:text-fg hover:bg-surface-2 font-medium",
  danger: "bg-danger text-white font-semibold hover:opacity-90",
  link: "text-accent font-semibold hover:underline underline-offset-4 px-0 py-0",
};

export function Button({ variant = "primary", size = "md", loading, className = "", children, disabled, type = "button", ...props }) {
  const sz = variant === "link" ? "text-sm" : size === "sm" ? "h-9 px-3.5 text-sm rounded-xl" : size === "lg" ? "h-13 px-6 text-base rounded-[var(--radius-control)]" : "h-12 px-5 text-sm rounded-[var(--radius-control)]";
  return (
    <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none ${sz} ${VARIANTS[variant]} ${className}`}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ── Form fields ────────────────────────────────────────────────────────── */
export const inputCls = (err) =>
  `w-full h-12 bg-surface border ${err ? "border-danger" : "border-line-strong"} rounded-[var(--radius-control)] px-4 text-[15px] text-fg placeholder:text-subtle
   focus:outline-none focus:border-mint-600 focus:ring-4 focus:ring-mint-500/15 transition-[border-color,box-shadow] disabled:opacity-60`;

/** Label + control + hint/error, wired with ids for screen readers.
 *  `children` is a render function receiving the props to spread on the control. */
export function Field({ label, hint, error, optional, children, className = "" }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-fg mb-1.5">
        <span>{label}{optional && <span className="text-subtle font-normal"> (optional)</span>}</span>
      </label>
      {children({ id, "aria-invalid": !!error || undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger-fg" role="alert">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />{error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ── Banners / badges ───────────────────────────────────────────────────── */
const BANNER = {
  info: { cls: "bg-surface-2 border-line text-fg", icon: Info, iconCls: "text-accent" },
  success: { cls: "bg-success-soft border-mint-600/30 text-fg", icon: CheckCircle2, iconCls: "text-mint-700" },
  warn: { cls: "bg-warning-soft border-warning/40 text-fg", icon: AlertTriangle, iconCls: "text-warning" },
  error: { cls: "bg-danger-soft border-danger/40 text-fg", icon: AlertCircle, iconCls: "text-danger" },
};

export function Banner({ tone = "info", title, children, action, icon }) {
  const t = BANNER[tone];
  const Icon = icon || t.icon;
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-sm ${t.cls}`} role={tone === "error" ? "alert" : undefined}>
      <Icon className={`w-[18px] h-[18px] mt-0.5 shrink-0 ${t.iconCls}`} aria-hidden />
      <div className="flex-1 min-w-0 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "text-muted mt-0.5" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

const BADGE = {
  success: "bg-success-soft text-success-fg border-mint-600/30",
  warning: "bg-warning-soft text-warning-fg border-warning/40",
  danger: "bg-danger-soft text-danger-fg border-danger/40",
  neutral: "bg-surface-2 text-muted border-line",
  gold: "bg-gold-soft text-gold-fg border-gold-300/60",
};

export function Badge({ tone = "neutral", children, className = "", icon: Icon }) {
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full border text-xs font-semibold whitespace-nowrap ${BADGE[tone]} ${className}`}>
      {Icon && <Icon className="w-3 h-3" aria-hidden />}{children}
    </span>
  );
}

/* ── Loading / empty ────────────────────────────────────────────────────── */
export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 rounded-2xl border border-dashed border-line-strong">
      {Icon && <div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center mb-3"><Icon className="w-5 h-5 text-accent" aria-hidden /></div>}
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {text && <p className="text-sm text-muted mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="flex items-center justify-center py-10 text-muted gap-2 text-sm" role="status">
      <Loader2 className="w-5 h-5 animate-spin text-mint-600" aria-hidden />{label}…
    </div>
  );
}

/* ── Dialogs ────────────────────────────────────────────────────────────── */
export function ModalShell({ title, subtitle, onClose, children, busy = false, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-ink-950/50 backdrop-blur-[2px]"
      onClick={() => !busy && onClose?.()}>
      <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className={`bg-surface border border-line rounded-t-[28px] sm:rounded-[var(--radius-card)] w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} shadow-[var(--shadow-pop)] max-h-[92dvh] flex flex-col outline-none`}>
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-fg">{title}</h2>
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close"
            className="p-2 -m-1 rounded-xl text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 sm:p-6 overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, busy, onConfirm, onClose }) {
  return (
    <ModalShell title={title} onClose={onClose} busy={busy}>
      <p className="text-sm text-muted leading-relaxed">{message}</p>
      <div className="flex gap-2 mt-6">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} className="flex-1" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </ModalShell>
  );
}

/** Key/value row for receipts and summaries. */
export function Row({ k, v, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted shrink-0">{k}</span>
      <span className={`text-sm text-right break-words [overflow-wrap:anywhere] min-w-0 ${strong ? "font-bold text-fg" : "text-fg"}`}>{v}</span>
    </div>
  );
}
