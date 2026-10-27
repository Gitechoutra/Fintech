import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowRight, CalendarClock, ChevronRight, CreditCard, IndianRupee, Landmark, ReceiptText, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PAYMENT_STATUS, daysUntil, fmtDate, fmtINR } from "../../utils/format";
import { classifyDues, dueLabel, emiStatus, summarize } from "../../utils/loans";
import { Badge, Banner, Button, Card, Skeleton } from "../../components/ui";
import { useApp } from "./AppContext";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Home: summary, Money transfer (Bills · Cards · EMIs · Loans), upcoming payments and recent activity. */
export function HomePage() {
  const { api, user } = useAuth();
  const { payCfg, openPay, version } = useApp();
  const [loans, setLoans] = useState(null);
  const [cards, setCards] = useState(null);
  const [openPayments, setOpenPayments] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [l, c, o, p] = await Promise.all([api("/loans"), api("/cards"), api("/payments?status=OPEN&per_page=50"), api("/payments?per_page=4")]);
    if (l.ok) { setLoans(l.data.loans); setError(""); } else setError(l.message);
    setCards(c.ok ? c.data.cards : []);
    setOpenPayments(o.ok ? o.data.payments : []);
    setRecent(p.ok ? p.data.payments : []);
  }, [api]);
  useEffect(() => { load(); }, [load, version]);

  const first = (user.full_name || "").split(" ")[0];
  const s = loans ? summarize(loans) : null;
  const active = loans?.filter((l) => l.loan_status !== "CLOSED") || [];
  const pending = loans && openPayments ? classifyDues(loans).pending.length + openPayments.length : null;
  const primary = cards?.find((c) => c.is_primary) || cards?.[0];
  const nextEmi = s?.nextLoan;

  const tiles = [
    { to: "/dashboard/bills", icon: ReceiptText, title: "Bills",
      info: pending === null ? null : pending ? `${pending} pending` : "Nothing pending", alert: pending > 0 },
    { to: "/dashboard/cards", icon: CreditCard, title: "Cards",
      info: cards === null ? null : cards.length ? `${plural(cards.length, "card")} · ${primary.provider.short_name} ${primary.masked_number}` : "No cards linked" },
    { to: "/dashboard/emis", icon: CalendarClock, title: "EMIs",
      info: loans === null ? null : !active.length ? "No active EMIs"
        : nextEmi ? `Next ${fmtINR(nextEmi.emi_amount)} · ${fmtDate(nextEmi.next_due_date)}` : `${plural(active.length, "active EMI")} · ${emiStatus(active[0]).label}` },
    { to: "/dashboard/loans", icon: Landmark, title: "Loans",
      info: loans === null ? null : !loans.length ? "No loans linked"
        : `${plural(loans.length, "loan")} · ${s.totalOutstanding !== null ? `${fmtINR(s.totalOutstanding)} outstanding` : "details not shared"}` },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-muted">{greeting()},</p>
          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-fg">{first || "Welcome back"}</h1>
        </div>
        <p className="text-sm text-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      {payCfg && !payCfg.configured && loans?.length > 0 && (
        <div className="mb-5"><Banner tone="warn" icon={AlertTriangle} title="Payments are not available yet">{payCfg.message}</Banner></div>
      )}
      {payCfg?.configured && payCfg.mode === "test" && (
        <div className="mb-5"><Banner tone="warn" title="Payments are in test mode">{payCfg.message}</Banner></div>
      )}
      {error && <div className="mb-5"><Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{error}</Banner></div>}

      {/* Summary */}
      <section aria-label="Summary" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 mb-10">
        <SummaryTile icon={IndianRupee} label="Total outstanding" loading={!s}
          value={s && fmtINR(s.totalOutstanding)}
          note={s && (s.totalOutstanding === null ? "Not shared by your lender"
            : s.unreported ? `${plural(s.unreported, "loan")} not reported` : `Across ${plural(s.count, "loan")}`)} />
        <SummaryTile icon={Wallet} label="Upcoming EMI" loading={!s}
          value={s && fmtINR(s.upcomingEmi)}
          note={s && (s.nextLoan ? `${s.nextLoan.product_name || "Loan"} ${s.nextLoan.masked_number}` : "Not shared by your lender")} />
        <SummaryTile icon={CalendarClock} label="Next due date" loading={!s}
          value={s && fmtDate(s.nextDueDate)}
          note={s && (s.nextDueDate ? dueLabel(s.nextDueInDays) : "Not shared by your lender")}
          tone={s?.nextDueInDays !== null && s?.nextDueInDays < 0 ? "danger" : undefined} />
      </section>

      {/* Money transfer */}
      <section aria-labelledby="mt-h" className="mb-10">
        <h2 id="mt-h" className="text-lg font-bold text-fg mb-4">Money transfer</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {tiles.map((t) => (
            <Link key={t.to} to={t.to}
              className="group flex flex-col justify-between gap-5 min-h-40 p-4 sm:p-5 rounded-[var(--radius-card)] bg-surface border border-line
                shadow-[var(--shadow-card)] hover:border-mint-600/50 hover:-translate-y-0.5 transition-[border-color,transform] duration-200">
              <div className="flex items-start justify-between">
                <span className="relative w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center group-hover:bg-mint-600 transition-colors">
                  <t.icon className="w-[22px] h-[22px] text-accent group-hover:text-on-primary transition-colors" aria-hidden />
                  {t.alert && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-danger ring-2 ring-surface" aria-hidden />}
                </span>
                <ChevronRight className="w-4 h-4 text-subtle group-hover:text-accent transition-colors" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-fg">{t.title}</p>
                {t.info === null ? <Skeleton className="h-4 w-24 mt-1" />
                  : <p className={`text-xs mt-0.5 line-clamp-2 ${t.alert ? "text-danger-fg font-semibold" : "text-muted"}`}>{t.info}</p>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-fg">Upcoming payments</h2>
            <Link to="/dashboard/emis" className="text-sm font-semibold text-accent hover:underline underline-offset-4">All EMIs</Link>
          </div>
          {loans === null ? <Skeleton className="h-16" /> : active.length === 0 ? (
            <p className="text-sm text-muted">Nothing due.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...active].sort((a, b) => (a.next_due_date || "9999").localeCompare(b.next_due_date || "9999")).slice(0, 4).map((l) => (
                <li key={l.loan_id} className="flex items-center gap-3 py-3">
                  <span className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0"><CalendarClock className="w-[18px] h-[18px] text-accent" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg truncate">{l.product_name || "Loan"} <span className="text-muted font-normal tabular">{l.masked_number}</span></span>
                    <span className="block text-xs text-muted">
                      {l.next_due_date ? `${fmtDate(l.next_due_date)} · ${dueLabel(daysUntil(l.next_due_date))}` : "Due date not shared by your lender"}
                      {l.emi_amount ? ` · EMI ${fmtINR(l.emi_amount)}` : ""}
                    </span>
                  </span>
                  <Button size="sm" onClick={() => openPay(l)}>{l.open_payment_id ? "Status" : "Pay now"}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-fg">Recent activity</h2>
            <Link to="/dashboard/history" className="text-sm font-semibold text-accent hover:underline underline-offset-4 inline-flex items-center gap-1">
              History <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
          {recent === null ? <Skeleton className="h-16" /> : recent.length === 0 ? (
            <p className="text-sm text-muted">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((p) => {
                const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.CREATED;
                return (
                  <li key={p.payment_id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg tabular">{fmtINR(p.total)}</span>
                      <span className="block text-xs text-muted truncate">{fmtDate(p.created_at)} · {p.loan_label}</span>
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function SummaryTile({ icon: Icon, label, value, note, loading, tone }) {
  return (
    <Card className="p-3.5 sm:p-5 flex items-center sm:items-start gap-3 sm:gap-3.5">
      <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-accent-soft flex items-center justify-center shrink-0"><Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-accent" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        {loading ? <Skeleton className="h-7 w-32 mt-1.5" /> : (
          <p className={`text-lg sm:text-2xl font-extrabold tracking-tight tabular sm:mt-1 truncate ${tone === "danger" ? "text-danger-fg" : "text-fg"}`}>{value}</p>
        )}
        {!loading && note && <p className="text-xs text-muted mt-0.5 truncate">{note}</p>}
      </div>
    </Card>
  );
}
