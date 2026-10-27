import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { MotionConfig, motion } from "motion/react";
import { AlertTriangle, ArrowRight, CalendarClock, IndianRupee, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PAYMENT_STATUS, fmtDate, fmtINR } from "../../utils/format";
import { classifyDues, dueLabel, emiStatus, summarize } from "../../utils/loans";
import { Badge, Banner, Button, Card, Skeleton } from "../../components/ui";
import { useApp } from "./AppContext";
import { EMI_TYPES, LOAN_TYPES, OTHER_EMI, OTHER_LOAN, groupByProduct } from "../../utils/products";
import { BillsTile, CardsTile, ProductGrid, item, list } from "./HomeWidgets";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Home: summary, Money transfer (Bills · Cards), pending loans, pending EMIs and recent activity. */
export function HomePage() {
  const { api, user } = useAuth();
  const { payCfg, version, lendersAvailable } = useApp();
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
  const byDue = (a, b) => (a.next_due_date || "9999").localeCompare(b.next_due_date || "9999");
  const pendingEmis = [...active].filter((l) => emiStatus(l).label !== "Paid").sort(byDue);

  return (
    <MotionConfig reducedMotion="user">
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
      <motion.section aria-label="Summary" variants={list} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 mb-10">
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
      </motion.section>

      {/* Money transfer */}
      <section aria-labelledby="mt-h" className="mb-10">
        <h2 id="mt-h" className="text-lg font-bold text-fg mb-4">Money transfer</h2>
        <motion.div variants={list} initial="hidden" animate="show" className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4 max-w-[760px]">
          <BillsTile pending={pending} />
          <CardsTile cards={cards} />
        </motion.div>
      </section>

      {/* Loans */}
      <section aria-labelledby="loans-h" className="mb-10">
        <SectionHead id="loans-h" title="Loans" to="/dashboard/loans" link="All loans"
          meta={loans && active.length > 0 && `${plural(active.length, "loan")} to clear`} />
        {loans === null ? <GridSkeleton />
          : <ProductGrid kind="loan" groups={groupByProduct(active, LOAN_TYPES, OTHER_LOAN)} canLink={lendersAvailable} />}
      </section>

      {/* EMIs */}
      <section aria-labelledby="emis-h" className="mb-10">
        <SectionHead id="emis-h" title="EMIs" to="/dashboard/emis" link="All EMIs"
          meta={pendingEmis.length > 0 && `${plural(pendingEmis.length, "EMI")} pending`} />
        {loans === null ? <GridSkeleton />
          : <ProductGrid kind="emi" groups={groupByProduct(active, EMI_TYPES, OTHER_EMI)} canLink={lendersAvailable} />}
      </section>

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
    </MotionConfig>
  );
}

function SectionHead({ id, title, to, link, meta }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-baseline gap-2.5">
        <h2 id={id} className="text-lg font-bold text-fg">{title}</h2>
        {meta && <span className="text-xs font-semibold text-muted">{meta}</span>}
      </div>
      <Link to={to} className="text-sm font-semibold text-accent hover:underline underline-offset-4 inline-flex items-center gap-1">
        {link} <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 xs:grid-cols-3 lg:grid-cols-5 gap-3">
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36 !rounded-2xl" />)}
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, note, loading, tone }) {
  return (
    <motion.div variants={item}><Card className="p-3.5 sm:p-5 flex items-center sm:items-start gap-3 sm:gap-3.5 h-full">
      <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-accent-soft flex items-center justify-center shrink-0"><Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-accent" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        {loading ? <Skeleton className="h-7 w-32 mt-1.5" /> : (
          <p className={`text-lg sm:text-2xl font-extrabold tracking-tight tabular sm:mt-1 truncate ${tone === "danger" ? "text-danger-fg" : "text-fg"}`}>{value}</p>
        )}
        {!loading && note && <p className="text-xs text-muted mt-0.5 truncate">{note}</p>}
      </div>
    </Card></motion.div>
  );
}
