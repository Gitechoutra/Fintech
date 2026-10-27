import { motion } from "motion/react";

/** Accessible tab switcher used by Bills and History. */
export function Segmented({ tabs, value, onChange, label, id }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex p-1 rounded-2xl bg-surface-2 border border-line max-w-full overflow-x-auto">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button key={t.key} role="tab" type="button" aria-selected={active} onClick={() => onChange(t.key)}
            className={`relative h-9 px-3.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}>
            {active && <motion.span layoutId={`seg-${id}`} aria-hidden className="absolute inset-0 rounded-xl bg-surface shadow-sm border border-line"
              transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{t.label}{t.count !== undefined && <span className="ml-1.5 text-xs text-muted tabular">{t.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}
