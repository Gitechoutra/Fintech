import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ChevronRight, Landmark, Plus, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LoanLinker } from "../../components/LoanLinker";
import { LOAN_STATUS, fmtDate, fmtDateTime, fmtINR } from "../../utils/format";
import { emiStatus } from "../../utils/loans";
import { Badge, Banner, Button, Card, EmptyState, ModalShell, Row, Skeleton, useToast } from "../../components/ui";
import { useApp } from "./AppContext";
import { PageHeader } from "./AppShell";
import { LoanCard } from "./LoanCard";
import { PaymentList } from "./PaymentList";

/** Loans: all active loans; each opens its detail page. */
export function LoansPage() {
  const { api } = useAuth();
  const { openPay, version, lendersAvailable, reload } = useApp();
  const toast = useToast();
  const [loans, setLoans] = useState(null);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    const r = await api("/loans");
    if (r.ok) { setLoans(r.data.loans); setError(""); } else setError(r.message);
  }, [api]);
  useEffect(() => { load(); }, [load, version]);

  return (
    <>
      <PageHeader back={{ to: "/dashboard", label: "Home" }} title="Loans" text="Your linked loans. Open a loan for its details and payments."
        action={lendersAvailable && <Button size="sm" variant="secondary" onClick={() => setLinking(true)}><Plus className="w-4 h-4" aria-hidden />Link a loan</Button>} />
      {error ? <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{error}</Banner>
        : loans === null ? <Skeleton className="h-28" />
        : loans.length === 0 ? <EmptyState icon={Landmark} title="No loans linked" text="Link your Bajaj Finance loan to see it here." />
        : (
          <Card className="p-2 sm:p-3">
            <ul className="divide-y divide-line">
              {loans.map((l) => {
                const st = LOAN_STATUS[l.loan_status];
                const emi = emiStatus(l);
                return (
                  <li key={l.loan_id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3">
                    <Link to={`/dashboard/loans/${l.loan_id}`} className="flex items-center gap-3 min-w-0 flex-1 rounded-xl">
                      <span className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center shrink-0"><Landmark className="w-5 h-5 text-accent" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block font-bold text-fg truncate">{l.product_name || "Loan"} <span className="text-muted font-medium tabular">{l.masked_number}</span></span>
                        <span className="block text-xs text-muted truncate">
                          Outstanding {fmtINR(l.payable_balance ?? l.outstanding_balance)} · EMI {fmtINR(l.emi_amount)} · Due {fmtDate(l.next_due_date)}
                        </span>
                        <span className="flex flex-wrap gap-1.5 mt-1.5">
                          {st && <Badge tone={st.tone}>{st.label}</Badge>}
                          <Badge tone={emi.tone}>{emi.label}</Badge>
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-subtle ml-auto shrink-0" aria-hidden />
                    </Link>
                    <Button size="sm" onClick={() => openPay(l)}>{l.open_payment_id ? "Status" : "Pay now"}</Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      {linking && (
        <ModalShell title="Link a loan" wide onClose={() => setLinking(false)}>
          <LoanLinker onLinked={() => { setLinking(false); toast("success", "Loan verified and linked."); reload(); }} />
        </ModalShell>
      )}
    </>
  );
}

/** One loan: details, repayment progress, Pay now and its payment history. */
export function LoanDetailPage() {
  const { loanId } = useParams();
  const { api } = useAuth();
  const { openPay, version, payCfg } = useApp();
  const [loan, setLoan] = useState(undefined);

  useEffect(() => {
    api("/loans").then((r) => setLoan(r.ok ? r.data.loans.find((l) => l.loan_id === loanId) || null : null));
  }, [api, loanId, version]);

  if (loan === null) return <Navigate to="/dashboard/loans" replace />;
  return (
    <>
      <PageHeader back={{ to: "/dashboard/loans", label: "Loans" }} title={loan ? loan.product_name || "Loan" : "Loan"}
        text={loan ? `${loan.provider_name} · ${loan.masked_number}` : ""} />
      {loan === undefined ? <Skeleton className="h-96 !rounded-[26px]" /> : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <LoanCard loan={loan} onPay={openPay} paymentsReady={!!payCfg?.configured} onUpdated={setLoan} />
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-bold text-fg mb-2">Loan details</h2>
            <Row k="Lender" v={loan.provider_name} />
            <Row k="Loan account" v={<span className="tabular">{loan.masked_number}</span>} />
            <Row k="Status" v={LOAN_STATUS[loan.loan_status]?.label || "Not shared"} />
            <Row k="Loan amount" v={fmtINR(loan.sanctioned_amount)} />
            <Row k="Outstanding" v={fmtINR(loan.payable_balance ?? loan.outstanding_balance)} />
            <Row k="EMI" v={fmtINR(loan.emi_amount)} />
            <Row k="Next due date" v={fmtDate(loan.next_due_date)} />
            <Row k="EMI status" v={<Badge tone={emiStatus(loan).tone}>{emiStatus(loan).label}</Badge>} />
            <Row k="Linked on" v={fmtDateTime(loan.verified_at)} />
            {loan.verification_label && (
              <p className="flex items-start gap-1.5 text-xs text-muted mt-3"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-mint-600 shrink-0" aria-hidden />{loan.verification_label}</p>
            )}
          </Card>
        </div>
      )}
      {loan && (
        <Card className="p-4 sm:p-6 mt-6">
          <h2 className="text-lg font-bold text-fg mb-4">Payments on this loan</h2>
          <PaymentList loanId={loan.loan_id} version={version} emptyTitle="No payments on this loan yet"
            emptyText="Payments you make with Pay now appear here once Razorpay confirms them." />
        </Card>
      )}
    </>
  );
}
