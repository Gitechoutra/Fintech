import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { animate, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CalendarClock, ChevronRight, CreditCard, Landmark, ReceiptText } from "lucide-react";
import { daysUntil, fmtDate } from "../../utils/format";
import { emiStatus, repaymentProgress } from "../../utils/loans";
import { Badge, Button, ModalShell, Skeleton } from "../../components/ui";

const EASE = [0.22, 1, 0.36, 1];
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Stagger container + item for section entrances. */
export const list = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
export const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Animates a number from 0 to `value` once; null renders the formatter's placeholder. */
export function CountUp({ value, format = (n) => n, duration = 0.9 }) {
  const reduce = useReducedMotion();
  const target = num(value);
  const [n, setN] = useState(reduce || target === null ? target : 0);
  useEffect(() => {
    if (target === null || reduce) { setN(target); return; }
    const c = animate(0, target, { duration, ease: EASE, onUpdate: setN });
    return () => c.stop();
  }, [target, reduce, duration]);
  return <>{format(n)}</>;
}

/* ── Money transfer tiles ───────────────────────────────────────────────── */

const tileBase = "group relative overflow-hidden flex flex-col justify-between gap-4 h-full min-h-[150px] p-5 rounded-[var(--radius-card)]";

/** Bills: dark brand tile with the pending count. */
export function BillsTile({ pending }) {
  return (
    <motion.div variants={item} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="h-full">
      <Link to="/dashboard/bills" className={`${tileBase} text-white shadow-[0_18px_36px_-22px_rgb(0_58_45/0.7)]
        bg-[linear-gradient(135deg,#00614B_0%,#003A2D_60%,#0A0F0D_100%)]`}>
        <motion.span aria-hidden className="absolute -left-10 -top-12 w-40 h-40 rounded-full bg-mint-500/25 blur-3xl"
          animate={{ opacity: [0.45, 0.85, 0.45] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
        <ReceiptText aria-hidden className="absolute right-6 -bottom-4 w-24 h-24 text-white/[0.06] -rotate-12
          group-hover:rotate-0 group-hover:scale-110 transition-transform duration-500" />
        <div className="relative flex items-start justify-between">
          <span className="relative w-11 h-11 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-mint-300" aria-hidden />
            {pending > 0 && (
              <span className="absolute -top-1 -right-1 flex w-3 h-3" aria-hidden>
                <span className="absolute inset-0 rounded-full bg-danger animate-ping opacity-75" />
                <span className="relative w-3 h-3 rounded-full bg-danger ring-2 ring-[#00614B]" />
              </span>
            )}
          </span>
          <ArrowUpRight className="w-4 h-4 text-white/60 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden />
        </div>
        <div className="relative min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mint-200/80">Bills</p>
          {pending === null ? <Skeleton className="h-7 w-32 mt-1 !bg-white/10" /> : (
            <p className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[28px] leading-none font-extrabold tabular tracking-tight"><CountUp value={pending} /></span>
              <span className="text-sm text-white/75">{pending === 1 ? "bill pending" : "bills pending"}</span>
            </p>
          )}
          <p className="text-xs text-white/55 mt-1 truncate">{pending ? "Clear them before the due date" : "You're all caught up"}</p>
        </div>
      </Link>
    </motion.div>
  );
}

/** Cards: a fanned stack of the linked cards in their issuer colours; fans out on hover. */
export function CardsTile({ cards }) {
  const primary = cards?.find((c) => c.is_primary) || cards?.[0];
  const stack = (cards || []).slice(0, 3);
  return (
    <motion.div variants={item} whileHover="hover" initial="rest" animate="rest" className="h-full">
      <motion.div variants={{ rest: { y: 0 }, hover: { y: -3 } }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="h-full">
        <Link to="/dashboard/cards" className={`${tileBase} bg-surface border border-line shadow-[var(--shadow-card)] hover:border-mint-600/50 transition-colors`}>
          <div className="relative flex items-start justify-between">
            <span className="w-11 h-11 rounded-xl bg-accent-soft flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-accent" aria-hidden />
            </span>
            <ArrowUpRight className="w-4 h-4 text-subtle group-hover:text-accent transition-colors" aria-hidden />
          </div>
          <span aria-hidden className="absolute right-5 bottom-5 w-[104px] h-[64px]">
            {stack.map((c, i) => (
              <motion.span key={c.card_id} className="absolute left-0 bottom-0 w-[84px] h-[54px] rounded-lg ring-1 ring-white/10 shadow-md"
                style={{ background: `linear-gradient(135deg, ${c.provider.brand_color || "#00614B"}, #0A0F0D)`, zIndex: stack.length - i }}
                variants={{ rest: { rotate: -3 + i * 4, x: i * 7, y: i * -3 }, hover: { rotate: -6 + i * 7, x: i * 10, y: i * -4 } }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}>
                <span className="absolute left-2.5 top-2.5 w-4 h-3 rounded-[3px] bg-[linear-gradient(135deg,#F2DFA8,#9C8650)]" />
                <span className="absolute left-2.5 bottom-1.5 text-[8px] font-mono text-white/80 tabular">•••• {c.last4}</span>
              </motion.span>
            ))}
            {cards?.length === 0 && <span className="absolute left-0 bottom-0 w-[84px] h-[54px] rounded-lg border-2 border-dashed border-line-strong" />}
          </span>
          <div className="relative min-w-0 pr-28">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Cards</p>
            {cards === null ? <Skeleton className="h-7 w-28 mt-1" /> : (
              <>
                <p className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-[28px] leading-none font-extrabold tabular tracking-tight text-fg"><CountUp value={cards.length} /></span>
                  <span className="text-sm text-muted">{cards.length === 1 ? "card linked" : "cards linked"}</span>
                </p>
                <p className="text-xs text-muted mt-1 truncate">
                  {primary ? `Primary · ${primary.provider.short_name} ${primary.masked_number}` : "Link a card to pay EMIs"}
                </p>
              </>
            )}
          </div>
        </Link>
      </motion.div>
    </motion.div>
  );
}

/* ── Loans ──────────────────────────────────────────────────────────────── */

const compact = `group relative overflow-hidden flex flex-col gap-3 h-full p-4 rounded-2xl bg-surface border border-line
  shadow-[var(--shadow-card)] hover:border-mint-600/50 hover:shadow-[var(--shadow-pop)] transition-[border-color,box-shadow] duration-200`;

/** Compact pending-loan card: identity, status, repayment share. Opens the loan's detail page. */
export function LoanTile({ loan }) {
  const pct = repaymentProgress(loan);
  const overdue = loan.loan_status === "OVERDUE";
  return (
    <motion.li variants={item} whileHover={{ y: -3 }}>
      <Link to={`/dashboard/loans/${loan.loan_id}`} className={compact}>
        <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 ${overdue ? "bg-danger" : "bg-[linear-gradient(90deg,#00C594,#00F5B8)]"}`} />
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[linear-gradient(135deg,#00614B,#003A2D)] flex items-center justify-center shrink-0">
            <Landmark className="w-[18px] h-[18px] text-mint-300" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-sm text-fg truncate group-hover:text-accent transition-colors">{loan.product_name || "Loan"}</span>
            <span className="block text-xs text-muted truncate">{loan.provider_name} · <span className="tabular">{loan.masked_number}</span></span>
          </span>
          <ChevronRight className="w-4 h-4 text-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-transform shrink-0" aria-hidden />
        </div>
        {pct === null ? (
          <div className="h-1.5 rounded-full bg-[repeating-linear-gradient(135deg,var(--le-line)_0_5px,transparent_5px_10px)] border border-line" aria-hidden />
        ) : (
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Repaid">
            <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#00C594,#00F5B8)]"
              initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE, delay: 0.15 }} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{pct === null ? "Progress not shared" : <><span className="font-semibold text-fg tabular">{Math.round(pct)}%</span> repaid</>}</span>
          <Badge tone={overdue ? "danger" : "success"}>{overdue ? "Overdue" : "Active"}</Badge>
        </div>
      </Link>
    </motion.li>
  );
}

/* ── EMIs ───────────────────────────────────────────────────────────────── */

const RING_TONE = { danger: "#EF4444", warning: "#F59E0B", neutral: "#00C594", success: "#00C594" };

/** Countdown ring over a 30-day cycle: fuller = closer to the due date. */
export function DueRing({ days, tone, size = 48 }) {
  const r = 20, c = 2 * Math.PI * r;
  if (days === null) {
    return (
      <span style={{ width: size, height: size }} className="shrink-0 flex items-center justify-center rounded-full border-2 border-dashed border-line-strong">
        <CalendarClock className="w-[18px] h-[18px] text-subtle" aria-hidden />
      </span>
    );
  }
  const fill = days < 0 ? 1 : Math.min(1, Math.max(0.04, (30 - Math.min(days, 30)) / 30));
  return (
    <span style={{ width: size, height: size }} className="relative shrink-0" aria-hidden>
      <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--le-surface-2)" strokeWidth="4.5" />
        <motion.circle cx="24" cy="24" r={r} fill="none" stroke={RING_TONE[tone]} strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: c * (1 - fill) }}
          viewport={{ once: true }} transition={{ duration: 1, ease: EASE, delay: 0.15 }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`${size > 56 ? "text-xl" : "text-[13px]"} font-extrabold tabular text-fg`}>{Math.abs(days)}</span>
        <span className={`${size > 56 ? "text-[10px]" : "text-[8px]"} font-semibold uppercase text-muted mt-0.5`}>{days < 0 ? "late" : days === 1 ? "day" : "days"}</span>
      </span>
    </span>
  );
}

/** Compact pending-EMI card: countdown ring, loan identity, due date and status. Opens the EMI's detail page. */
export function EmiTile({ loan }) {
  const st = emiStatus(loan);
  const days = daysUntil(loan.next_due_date);
  return (
    <motion.li variants={item} whileHover={{ y: -3 }}>
      <Link to={`/dashboard/emis/${loan.loan_id}`} className={`${compact} !flex-row items-center`}>
        <span aria-hidden className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full" style={{ background: RING_TONE[st.tone] }} />
        <DueRing days={days} tone={st.tone} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-sm text-fg truncate group-hover:text-accent transition-colors">{loan.product_name || "Loan"}</span>
          <span className="block text-xs text-muted truncate">
            <span className="tabular">{loan.masked_number}</span> · {loan.next_due_date ? fmtDate(loan.next_due_date) : "Date not shared"}
          </span>
          <Badge tone={st.tone} className="mt-1.5">{st.label}</Badge>
        </span>
        <ChevronRight className="w-4 h-4 text-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-transform shrink-0" aria-hidden />
      </Link>
    </motion.li>
  );
}

/* ── Product grids (all Bajaj loan / EMI products) ──────────────────────── */

const byDue = (a, b) => (a.next_due_date || "9999").localeCompare(b.next_due_date || "9999");

/** Short status for a product the user has: the most urgent loan decides. */
function productStatus(kind, loans) {
  const many = loans.length > 1 ? `${loans.length} · ` : "";
  if (kind === "loan") {
    if (loans.some((l) => l.loan_status === "OVERDUE")) return { tone: "danger", text: `${many}Overdue` };
    const pct = loans.length === 1 ? repaymentProgress(loans[0]) : null;
    return { tone: "success", text: loans.length > 1 ? `${loans.length} active` : pct === null ? "Active" : `${Math.round(pct)}% repaid` };
  }
  const first = [...loans].sort(byDue)[0];
  const st = emiStatus(first);
  const days = daysUntil(first.next_due_date);
  const text = days === null || st.label === "Paid" ? st.label : days < 0 ? `${-days}d late` : days === 0 ? "Due today" : `Due in ${days}d`;
  return { tone: st.tone, text: `${many}${text}` };
}

function ProductTile({ kind, product, onOpen }) {
  const owned = product.loans.length > 0;
  const st = owned ? productStatus(kind, product.loans) : null;
  return (
    <motion.li variants={item}>
      <motion.button type="button" onClick={() => onOpen(product)} whileHover="hover" whileTap={{ scale: 0.97 }}
        variants={{ hover: { y: -4 } }} transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className={`group relative w-full h-full flex flex-col items-center text-center gap-2 px-3 pt-5 pb-4 rounded-2xl border transition-[border-color,box-shadow] duration-200
          ${owned ? "bg-[linear-gradient(160deg,var(--le-accent-soft),var(--le-surface)_70%)] border-mint-600/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-pop)]"
            : "bg-surface border-line hover:border-line-strong"}`}>
        {st?.tone === "danger" && (
          <span className="absolute top-3 right-3 flex w-2.5 h-2.5" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-danger animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-danger" />
          </span>
        )}
        <motion.span aria-hidden variants={{ hover: { rotate: [0, -12, 10, -6, 0], scale: 1.15 } }} transition={{ duration: 0.5 }}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[30px] leading-none
            ${owned ? "bg-surface shadow-[var(--shadow-card)]" : "bg-surface-2 opacity-75 group-hover:opacity-100 transition-opacity"}`}>
          {product.emoji}
        </motion.span>
        <span className={`text-[13px] font-bold leading-tight line-clamp-2 ${owned ? "text-fg" : "text-muted group-hover:text-fg transition-colors"}`}>{product.name}</span>
        {owned ? <Badge tone={st.tone}>{st.text}</Badge>
          : <span className="h-6 inline-flex items-center text-[11px] font-semibold text-subtle">Not availed</span>}
      </motion.button>
    </motion.li>
  );
}

/** All products as an animated grid. One loan opens its detail page; several open a
 *  picker; none explains it and offers linking. */
export function ProductGrid({ kind, groups, canLink }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const base = kind === "loan" ? "/dashboard/loans" : "/dashboard/emis";
  const open = (p) => (p.loans.length === 1 ? navigate(`${base}/${p.loans[0].loan_id}`) : setSheet(p));
  return (
    <>
      <motion.ul variants={list} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }}
        className="grid grid-cols-2 xs:grid-cols-3 lg:grid-cols-5 gap-3">
        {groups.map((p) => <ProductTile key={p.key} kind={kind} product={p} onOpen={open} />)}
      </motion.ul>
      {sheet && (
        <ModalShell title={`${sheet.emoji}  ${sheet.name}`} onClose={() => setSheet(null)}
          subtitle={sheet.loans.length ? `You have ${sheet.loans.length}. Choose one to see details${kind === "loan" ? " and pay" : " and pay the EMI"}.` : undefined}>
          {sheet.loans.length ? (
            <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
              {[...sheet.loans].sort(byDue).map((l) => (kind === "loan" ? <LoanTile key={l.loan_id} loan={l} /> : <EmiTile key={l.loan_id} loan={l} />))}
            </motion.ul>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <motion.span aria-hidden className="text-6xl" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1, y: [0, -6, 0] }}
                transition={{ scale: { type: "spring", stiffness: 260, damping: 14 }, y: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 } }}>
                {sheet.emoji}
              </motion.span>
              <p className="font-bold text-fg mt-4">No {sheet.name} {kind === "loan" ? "linked" : "running"}</p>
              <p className="text-sm text-muted mt-1 max-w-xs">
                {kind === "loan" ? "If you have this loan with Bajaj Finance, link it to track it and pay EMIs here."
                  : "EMIs appear here once you link the loan they belong to."}
              </p>
              {canLink && <Button className="mt-5" onClick={() => navigate("/dashboard/loans")}>Link a loan</Button>}
            </div>
          )}
        </ModalShell>
      )}
    </>
  );
}
