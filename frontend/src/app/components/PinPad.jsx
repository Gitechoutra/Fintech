import { useEffect } from "react";
import { motion } from "motion/react";
import { Delete, Fingerprint } from "lucide-react";

/** Masked 4-digit MPIN entry with an on-screen keypad (touch) and physical
 *  keyboard support. The digits live only in React state for the moment they
 *  are typed — never in storage. */
export function PinPad({ value, onChange, length = 4, onComplete, disabled, error, onBiometric, label = "MPIN", compact = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (disabled || e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const press = (d) => {
    if (disabled || value.length >= length) return;
    const next = value + d;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const key = compact ? "w-14 h-14 text-xl" : "w-16 h-16 sm:w-[72px] sm:h-[72px] text-2xl";

  return (
    <div className="w-full flex flex-col items-center">
      <motion.div className={`flex gap-4 ${compact ? "mb-5" : "mb-7"}`} role="status" aria-label={`${label}: ${value.length} of ${length} digits entered`}
        animate={error ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.35 }} key={error ? `e${error}` : "ok"}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
            i < value.length ? (error ? "bg-danger border-danger" : "bg-mint-600 border-mint-600 scale-110") : "border-line-strong"}`} />
        ))}
      </motion.div>

      <div className={`grid grid-cols-3 justify-items-center ${compact ? "gap-x-5 gap-y-2.5" : "gap-x-6 gap-y-3.5"}`}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} cls={key} onClick={() => press(d)} disabled={disabled}>{d}</Key>
        ))}
        {onBiometric ? (
          <Key cls={key} onClick={onBiometric} disabled={disabled} label="Unlock with biometrics" plain>
            <Fingerprint className="w-7 h-7 text-mint-600" />
          </Key>
        ) : <span aria-hidden />}
        <Key cls={key} onClick={() => press("0")} disabled={disabled}>0</Key>
        <Key cls={key} onClick={() => onChange(value.slice(0, -1))} disabled={disabled || !value} label="Delete digit" plain>
          <Delete className="w-6 h-6" />
        </Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, disabled, label, plain, cls }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className={`${cls} rounded-full flex items-center justify-center font-semibold tabular text-fg select-none touch-manipulation
        transition active:scale-95 disabled:opacity-40
        ${plain ? "text-muted hover:bg-surface-2" : "bg-surface-2 border border-line hover:border-mint-600/50 active:bg-accent-soft"}`}>
      {children}
    </button>
  );
}
