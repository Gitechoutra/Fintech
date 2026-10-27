import { useRef } from "react";

/** Segmented one-time-code input. Supports typing, paste, backspace across
 *  boxes and the platform's SMS autofill (autocomplete="one-time-code"). */
export function OtpInput({ value, onChange, length = 6, disabled, error, autoFocus, label = "One-time code", onComplete }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  const set = (next) => {
    const v = next.replace(/\D/g, "").slice(0, length);
    onChange(v);
    if (v.length === length) onComplete?.(v);
    return v;
  };

  const onInput = (i, e) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) return;
    if (raw.length > 1) {                                // paste / autofill into one box
      const v = set(raw);
      refs.current[Math.min(v.length, length - 1)]?.focus();
      return;
    }
    const arr = digits.slice();
    arr[i] = raw;
    set(arr.join(""));
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[i]) { arr[i] = ""; set(arr.join("")); }
      else if (i > 0) { arr[i - 1] = ""; set(arr.join("")); refs.current[i - 1]?.focus(); }
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex gap-2 sm:gap-2.5 justify-between max-w-sm">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => (refs.current[i] = el)}
          value={d} disabled={disabled} inputMode="numeric" pattern="[0-9]*" maxLength={length}
          autoComplete={i === 0 ? "one-time-code" : "off"} autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1} of ${length}`} aria-invalid={!!error || undefined}
          onChange={(e) => onInput(i, e)} onKeyDown={(e) => onKeyDown(i, e)} onFocus={(e) => e.target.select()}
          className={`w-full min-w-0 aspect-[5/6] max-w-14 text-center text-xl font-bold tabular rounded-[var(--radius-control)] bg-surface border
            ${error ? "border-danger" : d ? "border-mint-600" : "border-line-strong"} text-fg
            focus:outline-none focus:border-mint-600 focus:ring-4 focus:ring-mint-500/15 transition disabled:opacity-60`} />
      ))}
    </div>
  );
}
