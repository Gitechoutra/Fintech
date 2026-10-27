import { Check, X } from "lucide-react";

export const JOURNEY = [
  { key: "account", label: "Account" },
  { key: "loan", label: "Loan" },
  { key: "card", label: "Card" },
  { key: "security", label: "Security" },
  { key: "dashboard", label: "Dashboard" },
];

/** 01 Account → 02 Loan → 03 Card → 04 Security → 05 Dashboard.
 *  `steps` comes from the server ({account: "DONE", card: "CURRENT", …});
 *  `viewing` is the step on screen (may be an earlier, completed one). */
export function ProgressSteps({ steps = {}, viewing, complete }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {JOURNEY.map((s, i) => {
          const state = s.key === "dashboard" ? (complete ? "CURRENT" : "PENDING") : steps[s.key] || "PENDING";
          const done = state === "DONE" || state === "SKIPPED";
          const failed = state === "FAILED";
          const isViewing = viewing === s.key;
          const label = done ? (state === "SKIPPED" ? "skipped" : "completed") : failed ? "needs attention" : state === "CURRENT" ? "current step" : "not started";
          return (
            <li key={s.key} className="flex items-center gap-1.5 sm:gap-2 flex-1 last:flex-none min-w-0"
              aria-current={isViewing ? "step" : undefined}>
              <span className="flex items-center gap-2 min-w-0">
                <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold tabular border-2 transition-colors
                  ${done ? "bg-mint-600 border-mint-600 text-on-primary"
                    : failed ? "bg-danger-soft border-danger text-danger-fg"
                    : state === "CURRENT" ? "bg-accent-soft border-mint-600 text-accent"
                    : "bg-surface border-line-strong text-subtle"}
                  ${isViewing ? "ring-4 ring-mint-500/20" : ""}`}>
                  {done ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden /> : failed ? <X className="w-4 h-4" strokeWidth={3} aria-hidden /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className={`hidden md:block text-sm font-semibold truncate ${isViewing || state === "CURRENT" ? "text-fg" : done ? "text-muted" : "text-subtle"}`}>
                  {s.label}
                </span>
                <span className="sr-only">{s.label}: {label}</span>
              </span>
              {i < JOURNEY.length - 1 && (
                <span aria-hidden className={`h-0.5 flex-1 rounded-full min-w-3 ${done ? "bg-mint-600" : "bg-line"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
