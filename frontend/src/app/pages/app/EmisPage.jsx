import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Info } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { daysUntil, fmtDate, fmtINR } from "../../utils/format";
import { dueLabel, emiStatus } from "../../utils/loans";
import { Badge, Banner, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import { useApp } from "./AppContext";
import { PageHeader } from "./AppShell";

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
                      <Link to={`/dashboard/loans/${l.loan_id}`} className="inline-flex items-center h-9 px-3.5 rounded-xl text-sm font-semibold text-muted hover:text-fg hover:bg-surface-2">
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
