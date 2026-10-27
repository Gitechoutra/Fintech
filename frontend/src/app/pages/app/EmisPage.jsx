import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { motion } from "motion/react";
import { ArrowRight, CalendarClock, Info } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { daysUntil, fmtDate, fmtINR } from "../../utils/format";
import { dueLabel, emiStatus } from "../../utils/loans";
import { Badge, Banner, Button, Card, EmptyState, Row, Skeleton } from "../../components/ui";
import { useApp } from "./AppContext";
import { PageHeader } from "./AppShell";
import { CountUp, DueRing } from "./HomeWidgets";
import { PaymentList } from "./PaymentList";

/** EMIs: every active EMI with amount, due date and payment status; view or pay. */
export function EmisPage() {
  const { api } = useAuth();
  const { openPay, version } = useApp();
  const [loans, setLoans] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await api("/loans");
    if (r.ok) { setLoans(r.data.loans.filter((l) => l.loan_status !== "CLOSED")); setError(""); } else setError(r.message);
  }, [api]);
  useEffect(() => { load(); }, [load, version]);

  const undated = loans?.some((l) => !l.next_due_date || !l.emi_amount);

  return (
    <>
      <PageHeader back={{ to: "/dashboard", label: "Home" }} title="EMIs" text="Your active EMIs, when they're due and whether they're paid." />
      {error ? <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{error}</Banner>
        : loans === null ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : loans.length === 0 ? <EmptyState icon={CalendarClock} title="No active EMIs" text="Link a loan to see its EMIs here." />
        : (
          <div className="space-y-3">
            {loans.map((l) => {
              const st = emiStatus(l);
              const days = daysUntil(l.next_due_date);
              return (
                <Card key={l.loan_id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center shrink-0">
                      <CalendarClock className="w-5 h-5 text-accent" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-fg truncate">{l.product_name || "Loan"} <span className="text-muted font-medium tabular">{l.masked_number}</span></p>
                      <p className="text-sm text-muted">{l.provider_name}</p>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-line">
                    <div><dt className="text-xs text-muted">EMI amount</dt><dd className="font-bold text-fg tabular">{fmtINR(l.emi_amount)}</dd></div>
                    <div><dt className="text-xs text-muted">Due date</dt><dd className="font-semibold text-fg">{fmtDate(l.next_due_date)}</dd>
                      {days !== null && <dd className="text-xs text-muted">{dueLabel(days)}</dd>}</div>
                    <div className="col-span-2 sm:col-span-1 flex sm:justify-end items-end gap-2">
                      <Link to={`/dashboard/emis/${l.loan_id}`} className="inline-flex items-center h-9 px-3.5 rounded-xl text-sm font-semibold text-muted hover:text-fg hover:bg-surface-2">
                        View
                      </Link>
                      <Button size="sm" onClick={() => openPay(l)}>{l.open_payment_id ? "Status" : "Pay EMI"}</Button>
                    </div>
                  </dl>
                </Card>
              );
            })}
            {undated && (
              <p className="flex items-start gap-1.5 text-xs text-muted pt-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                Your lender doesn't share the EMI amount or due date through OTP verification — check them in the lender's app. You can still pay any amount here.
              </p>
            )}
          </div>
        )}
    </>
  );
}

/** One EMI: amount, due countdown, status, Pay EMI and the payments made on this loan. */
export function EmiDetailPage() {
  const { loanId } = useParams();
  const { api } = useAuth();
  const { openPay, version } = useApp();
  const [loan, setLoan] = useState(undefined);

  useEffect(() => {
    api("/loans").then((r) => setLoan(r.ok ? r.data.loans.find((l) => l.loan_id === loanId) || null : null));
  }, [api, loanId, version]);

  if (loan === null) return <Navigate to="/dashboard/emis" replace />;
  const st = loan ? emiStatus(loan) : null;
  const days = loan ? daysUntil(loan.next_due_date) : null;
  return (
    <>
      <PageHeader back={{ to: "/dashboard/emis", label: "EMIs" }} title={loan ? `${loan.product_name || "Loan"} EMI` : "EMI"}
        text={loan ? `${loan.provider_name} · ${loan.masked_number}` : ""} />
      {loan === undefined ? <Skeleton className="h-72" /> : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-[26px] p-6 sm:p-7 text-white bg-[linear-gradient(140deg,#0A0F0D_0%,#14211D_55%,#023D2E_100%)] shadow-[0_24px_50px_-28px_rgb(0_58_45/0.85)]">
            <div aria-hidden className="absolute -right-20 -top-24 w-64 h-64 rounded-full bg-mint-500/15 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint-200/80">EMI amount</p>
                <p className="text-4xl font-extrabold tracking-tight tabular mt-1">
                  {loan.emi_amount ? <CountUp value={loan.emi_amount} format={(n) => fmtINR(n)} /> : <span className="text-xl text-white/70">Not shared by your lender</span>}
                </p>
                <p className="text-sm text-white/70 mt-2">
                  {loan.next_due_date ? `Due ${fmtDate(loan.next_due_date)} · ${dueLabel(days)}` : "Due date not shared by your lender"}
                </p>
              </div>
              <span className="rounded-full bg-surface p-1"><DueRing days={days} tone={st.tone} size={72} /></span>
            </div>
            <div className="relative flex flex-wrap items-center gap-3 mt-7">
              <Button size="lg" onClick={() => openPay(loan)}>{loan.open_payment_id ? "Payment status" : "Pay EMI"}</Button>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
          </motion.div>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-bold text-fg mb-2">EMI details</h2>
            <Row k="Lender" v={loan.provider_name} />
            <Row k="Loan account" v={<span className="tabular">{loan.masked_number}</span>} />
            <Row k="EMI amount" v={fmtINR(loan.emi_amount)} strong />
            <Row k="Due date" v={fmtDate(loan.next_due_date)} />
            <Row k="Status" v={<Badge tone={st.tone}>{st.label}</Badge>} />
            <Row k="Outstanding" v={fmtINR(loan.payable_balance ?? loan.outstanding_balance)} />
            <Link to={`/dashboard/loans/${loan.loan_id}`} className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-accent hover:underline underline-offset-4">
              View loan <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </Card>
        </div>
      )}
      {loan && (
        <Card className="p-4 sm:p-6 mt-6">
          <h2 className="text-lg font-bold text-fg mb-4">EMI payments</h2>
          <PaymentList loanId={loan.loan_id} version={version} emptyTitle="No EMI payments yet"
            emptyText="EMIs you pay here appear once Razorpay confirms them." />
        </Card>
      )}
    </>
  );
}
